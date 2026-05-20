package service

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	toolmodel "kube-bt-sync/api/tool/model"
	"kube-bt-sync/common/appctx"

	"github.com/google/uuid"
)

const (
	ipSegmentsKVKey    = "toolbox_ip_segments_v1"
	ipScanHistoryKVKey = "toolbox_ip_scan_history_v1"
	maxIPScanAddresses = 512
	ipScanWorkerCount  = 48
	ipScanDialTimeout  = 280 * time.Millisecond
	maxIPScanHistory   = 80
)

var (
	ErrIPScanBusy        = errors.New("ip scan already running")
	ErrIPScanHistorySave = errors.New("ip scan history save failed")
	ipScanMu             sync.Mutex
	beijingTZ            = time.FixedZone("Asia/Shanghai", 8*60*60)
)

func LoadSegments(app *appctx.ServerApp) ([]string, error) {
	kv := app.PlatformKV()
	if kv == nil {
		return nil, errors.New("platform_kv 不可用")
	}
	raw, ok := kv.Get(ipSegmentsKVKey)
	if !ok || strings.TrimSpace(raw) == "" {
		return []string{}, nil
	}
	var cfg toolmodel.IPSegmentsConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(cfg.Segments))
	for _, s := range cfg.Segments {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	return out, nil
}

func NormalizeSegments(segments []string) ([]string, error) {
	norm := make([]string, 0, len(segments))
	for _, s := range segments {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, _, err := net.ParseCIDR(s); err != nil {
			return nil, fmt.Errorf("无效 CIDR: %s (%v)", s, err)
		}
		norm = append(norm, s)
	}
	return norm, nil
}

func SaveSegments(app *appctx.ServerApp, segments []string) error {
	kv := app.PlatformKV()
	if kv == nil {
		return errors.New("platform_kv 不可用")
	}
	cfg := toolmodel.IPSegmentsConfig{Segments: segments}
	b, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	if err := kv.Set(ipSegmentsKVKey, string(b)); err != nil {
		return err
	}
	appctx.MirrorPlatformKVIfDualWrite(app)
	return nil
}

func LoadHistory(app *appctx.ServerApp) ([]toolmodel.IPScanRun, error) {
	kv := app.PlatformKV()
	if kv == nil {
		return nil, errors.New("platform_kv 不可用")
	}
	raw, ok := kv.Get(ipScanHistoryKVKey)
	if !ok || strings.TrimSpace(raw) == "" {
		return []toolmodel.IPScanRun{}, nil
	}
	var runs []toolmodel.IPScanRun
	if err := json.Unmarshal([]byte(raw), &runs); err != nil {
		return nil, err
	}
	return runs, nil
}

func RunScan(app *appctx.ServerApp, segment string) (toolmodel.IPScanRun, error) {
	segment = strings.TrimSpace(segment)
	ips, err := enumerateIPv4CIDR(segment)
	if err != nil {
		return toolmodel.IPScanRun{}, err
	}
	if !ipScanMu.TryLock() {
		return toolmodel.IPScanRun{}, ErrIPScanBusy
	}
	defer ipScanMu.Unlock()

	started := time.Now().In(beijingTZ)
	run := toolmodel.IPScanRun{
		ID:          uuid.NewString(),
		StartedAt:   started.Format(time.RFC3339Nano),
		Segment:     segment,
		PodSourceIP: outboundPodSourceIP(),
		Note:        "在 Pod 内发起 TCP 探测（常见端口），无 ICMP。若目标防火墙丢弃探测包，可能被标为「疑似空闲」。",
	}
	run.Results = runIPScanParallel(ips)
	for _, r := range run.Results {
		switch r.Status {
		case "used":
			run.Summary.Used++
		case "likely_free":
			run.Summary.LikelyFree++
		}
	}
	run.Summary.Total = len(run.Results)
	run.EndedAt = time.Now().In(beijingTZ).Format(time.RFC3339Nano)

	if err := appendHistory(app, run); err != nil {
		return toolmodel.IPScanRun{}, fmt.Errorf("%w: %v", ErrIPScanHistorySave, err)
	}
	return run, nil
}

func appendHistory(app *appctx.ServerApp, run toolmodel.IPScanRun) error {
	kv := app.PlatformKV()
	if kv == nil {
		return errors.New("platform_kv 不可用")
	}
	runs, err := LoadHistory(app)
	if err != nil {
		runs = []toolmodel.IPScanRun{}
	}
	next := append([]toolmodel.IPScanRun{run}, runs...)
	if len(next) > maxIPScanHistory {
		next = next[:maxIPScanHistory]
	}
	b, err := json.Marshal(next)
	if err != nil {
		return err
	}
	if err := kv.Set(ipScanHistoryKVKey, string(b)); err != nil {
		return err
	}
	appctx.MirrorPlatformKVIfDualWrite(app)
	return nil
}

func outboundPodSourceIP() string {
	if v := strings.TrimSpace(os.Getenv("POD_IP")); v != "" {
		return v
	}
	conn, err := net.DialTimeout("udp", "8.8.8.8:80", 2*time.Second)
	if err != nil {
		return ""
	}
	defer conn.Close()
	if ua, ok := conn.LocalAddr().(*net.UDPAddr); ok {
		return ua.IP.String()
	}
	return ""
}

func enumerateIPv4CIDR(cidr string) ([]string, error) {
	_, ipnet, err := net.ParseCIDR(strings.TrimSpace(cidr))
	if err != nil {
		return nil, err
	}
	ip4 := ipnet.IP.To4()
	if ip4 == nil {
		return nil, fmt.Errorf("仅支持 IPv4 CIDR")
	}
	maskOnes, bits := ipnet.Mask.Size()
	if bits != 32 {
		return nil, fmt.Errorf("无效 CIDR")
	}
	size := uint64(1) << uint(32-maskOnes)
	if size > maxIPScanAddresses {
		return nil, fmt.Errorf("网段过大（最大 %d 个地址）", maxIPScanAddresses)
	}
	if maskOnes == 32 {
		return []string{ip4.String()}, nil
	}
	start := binary.BigEndian.Uint32(ip4)
	out := make([]string, 0, size)
	for i := uint64(0); i < size; i++ {
		addr := start + uint32(i)
		ip := make(net.IP, 4)
		binary.BigEndian.PutUint32(ip, addr)
		if !ipnet.Contains(ip) {
			continue
		}
		out = append(out, ip.String())
	}
	return out, nil
}

func tcpProbeHostUsed(ip string) bool {
	ports := []int{22, 80, 443, 445, 3389, 135}
	for _, p := range ports {
		addr := net.JoinHostPort(ip, strconv.Itoa(p))
		c, err := net.DialTimeout("tcp", addr, ipScanDialTimeout)
		if err == nil {
			_ = c.Close()
			return true
		}
		var ne net.Error
		if errors.As(err, &ne) && ne.Timeout() {
			continue
		}
		if errors.Is(err, syscall.ECONNREFUSED) {
			return true
		}
		var opErr *net.OpError
		if errors.As(err, &opErr) && errors.Is(opErr.Err, syscall.ECONNREFUSED) {
			return true
		}
	}
	return false
}

func runIPScanParallel(ips []string) []toolmodel.IPScanResultRow {
	n := len(ips)
	out := make([]toolmodel.IPScanResultRow, n)
	workers := ipScanWorkerCount
	if workers > n {
		workers = n
	}
	if workers < 1 {
		workers = 1
	}
	jobs := make(chan int, n)
	var wg sync.WaitGroup
	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for idx := range jobs {
				ip := ips[idx]
				if tcpProbeHostUsed(ip) {
					out[idx] = toolmodel.IPScanResultRow{IP: ip, Status: "used"}
				} else {
					out[idx] = toolmodel.IPScanResultRow{IP: ip, Status: "likely_free"}
				}
			}
		}()
	}
	for i := 0; i < n; i++ {
		jobs <- i
	}
	close(jobs)
	wg.Wait()
	return out
}
