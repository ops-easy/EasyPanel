package redis

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"time"
)

// Client is a tiny RESP client for the Redis commands this service uses.
type Client struct {
	addr string
	pass string
	db   int
}

func Dial(addr, pass string, db int) (*Client, error) {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return nil, fmt.Errorf("Redis 地址为空")
	}
	r := &Client{addr: addr, pass: pass, db: db}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := r.Ping(ctx); err != nil {
		return nil, err
	}
	return r, nil
}

func (r *Client) Close() error { return nil }

func (r *Client) conn(ctx context.Context) (net.Conn, error) {
	var d net.Dialer
	c, err := d.DialContext(ctx, "tcp", r.addr)
	if err != nil {
		return nil, err
	}
	br := bufio.NewReader(c)
	if r.pass != "" {
		if err := r.writeArgs(c, "AUTH", r.pass); err != nil {
			_ = c.Close()
			return nil, err
		}
		if _, err := readSimpleStatus(br); err != nil {
			_ = c.Close()
			return nil, err
		}
	}
	if r.db != 0 {
		if err := r.writeArgs(c, "SELECT", strconv.Itoa(r.db)); err != nil {
			_ = c.Close()
			return nil, err
		}
		if _, err := readSimpleStatus(br); err != nil {
			_ = c.Close()
			return nil, err
		}
	}
	return &connReader{Conn: c, br: br}, nil
}

type connReader struct {
	net.Conn
	br *bufio.Reader
}

func (r *Client) Ping(ctx context.Context) error {
	c, err := r.conn(ctx)
	if err != nil {
		return err
	}
	defer c.Close()
	cr := c.(*connReader)
	if err := r.writeArgs(c, "PING"); err != nil {
		return err
	}
	_, err = readSimpleStatus(cr.br)
	return err
}

func (r *Client) Get(ctx context.Context, key string) (string, error) {
	c, err := r.conn(ctx)
	if err != nil {
		return "", err
	}
	defer c.Close()
	cr := c.(*connReader)
	if err := r.writeArgs(c, "GET", key); err != nil {
		return "", err
	}
	return readBulkString(cr.br)
}

func (r *Client) Del(ctx context.Context, keys ...string) error {
	var nonEmpty []string
	for _, k := range keys {
		k = strings.TrimSpace(k)
		if k != "" {
			nonEmpty = append(nonEmpty, k)
		}
	}
	if len(nonEmpty) == 0 {
		return nil
	}
	c, err := r.conn(ctx)
	if err != nil {
		return err
	}
	defer c.Close()
	cr := c.(*connReader)
	args := append([]string{"DEL"}, nonEmpty...)
	if err := r.writeArgs(c, args...); err != nil {
		return err
	}
	_, err = readIntegerReply(cr.br)
	return err
}

func (r *Client) Incr(ctx context.Context, key string) (int64, error) {
	c, err := r.conn(ctx)
	if err != nil {
		return 0, err
	}
	defer c.Close()
	cr := c.(*connReader)
	if err := r.writeArgs(c, "INCR", key); err != nil {
		return 0, err
	}
	return readIntegerReply(cr.br)
}

func readIntegerReply(br *bufio.Reader) (int64, error) {
	line, err := br.ReadString('\n')
	if err != nil {
		return 0, err
	}
	line = strings.TrimSpace(line)
	if strings.HasPrefix(line, "-") {
		return 0, errors.New(strings.TrimPrefix(line, "-"))
	}
	if strings.HasPrefix(line, ":") {
		return strconv.ParseInt(strings.TrimPrefix(line, ":"), 10, 64)
	}
	return 0, fmt.Errorf("unexpected redis integer: %s", line)
}

func (r *Client) Set(ctx context.Context, key string, val []byte, ttl time.Duration) error {
	c, err := r.conn(ctx)
	if err != nil {
		return err
	}
	defer c.Close()
	cr := c.(*connReader)
	sec := int(ttl / time.Second)
	if sec < 1 {
		sec = 1
	}
	if err := r.writeArgs(c, "SET", key, string(val), "EX", strconv.Itoa(sec)); err != nil {
		return err
	}
	_, err = readSimpleStatus(cr.br)
	return err
}

// SetPersist stores a value without an expiration.
func (r *Client) SetPersist(ctx context.Context, key string, val []byte) error {
	c, err := r.conn(ctx)
	if err != nil {
		return err
	}
	defer c.Close()
	cr := c.(*connReader)
	if err := r.writeSet3Bulk(c, key, val); err != nil {
		return err
	}
	_, err = readSimpleStatus(cr.br)
	return err
}

func (r *Client) writeSet3Bulk(c net.Conn, key string, val []byte) error {
	parts := [][]byte{[]byte("SET"), []byte(key), val}
	var buf bytes.Buffer
	buf.WriteString("*3\r\n")
	for _, p := range parts {
		buf.WriteString("$")
		buf.WriteString(strconv.Itoa(len(p)))
		buf.WriteString("\r\n")
		buf.Write(p)
		buf.WriteString("\r\n")
	}
	_, err := c.Write(buf.Bytes())
	return err
}

func (r *Client) writeArgs(c net.Conn, args ...string) error {
	var b strings.Builder
	b.WriteString("*")
	b.WriteString(strconv.Itoa(len(args)))
	b.WriteString("\r\n")
	for _, s := range args {
		b.WriteString("$")
		b.WriteString(strconv.Itoa(len(s)))
		b.WriteString("\r\n")
		b.WriteString(s)
		b.WriteString("\r\n")
	}
	_, err := c.Write([]byte(b.String()))
	return err
}

func readSimpleStatus(br *bufio.Reader) (string, error) {
	line, err := br.ReadString('\n')
	if err != nil {
		return "", err
	}
	line = strings.TrimSpace(line)
	if strings.HasPrefix(line, "-") {
		return "", errors.New(strings.TrimPrefix(line, "-"))
	}
	if strings.HasPrefix(line, "+") {
		return strings.TrimPrefix(line, "+"), nil
	}
	return "", fmt.Errorf("unexpected redis: %s", line)
}

func readBulkString(br *bufio.Reader) (string, error) {
	line, err := br.ReadString('\n')
	if err != nil {
		return "", err
	}
	line = strings.TrimSpace(line)
	if strings.HasPrefix(line, "-") {
		return "", errors.New(strings.TrimPrefix(line, "-"))
	}
	if line == "$-1" {
		return "", nil
	}
	if !strings.HasPrefix(line, "$") {
		return "", fmt.Errorf("expected bulk, got %s", line)
	}
	n, err := strconv.Atoi(line[1:])
	if err != nil {
		return "", err
	}
	buf := make([]byte, n+2)
	if _, err := io.ReadFull(br, buf); err != nil {
		return "", err
	}
	return string(buf[:n]), nil
}
