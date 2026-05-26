package platformkv

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type Store interface {
	Get(k string) (string, bool)
	Set(k, v string) error
	Snapshot() map[string]string
}

type File struct {
	mu   sync.Mutex
	path string
	data map[string]string
}

func NewFile(dataDir string) (*File, error) {
	path := filepath.Join(dataDir, "platform_kv.json")
	p := &File{path: path, data: map[string]string{}}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return p, nil
		}
		return nil, err
	}
	if len(b) == 0 {
		return p, nil
	}
	if err := json.Unmarshal(b, &p.data); err != nil {
		return nil, err
	}
	if p.data == nil {
		p.data = map[string]string{}
	}
	return p, nil
}

func (p *File) Set(k, v string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.data == nil {
		p.data = map[string]string{}
	}
	p.data[k] = v
	return p.saveLocked()
}

func (p *File) Get(k string) (string, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	v, ok := p.data[k]
	return v, ok
}

func (p *File) Snapshot() map[string]string {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make(map[string]string, len(p.data))
	for k, v := range p.data {
		out[k] = v
	}
	return out
}

func (p *File) saveLocked() error {
	b, err := json.MarshalIndent(p.data, "", "  ")
	if err != nil {
		return err
	}
	tmp := p.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, p.path)
}

var _ Store = (*File)(nil)
