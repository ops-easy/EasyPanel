package platformkv

import (
	"database/sql"
	"errors"
	"sync"
)

type MySQLStore struct {
	mu sync.Mutex
	db *sql.DB
}

func NewMySQL(db *sql.DB) (*MySQLStore, error) {
	if db == nil {
		return nil, errors.New("mysql db nil")
	}
	return &MySQLStore{db: db}, nil
}

func UpsertMySQL(db *sql.DB, k, v string) error {
	_, err := db.Exec(
		`INSERT INTO easypanel_platform_kv (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)`,
		k, v,
	)
	return err
}

func (p *MySQLStore) Get(k string) (string, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	var v sql.NullString
	err := p.db.QueryRow(`SELECT v FROM easypanel_platform_kv WHERE k=?`, k).Scan(&v)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", false
		}
		return "", false
	}
	if !v.Valid {
		return "", false
	}
	return v.String, true
}

func (p *MySQLStore) Set(k, v string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return UpsertMySQL(p.db, k, v)
}

func (p *MySQLStore) Snapshot() map[string]string {
	p.mu.Lock()
	defer p.mu.Unlock()
	rows, err := p.db.Query(`SELECT k,v FROM easypanel_platform_kv`)
	if err != nil {
		return map[string]string{}
	}
	defer rows.Close()
	out := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			continue
		}
		out[k] = v
	}
	return out
}

var _ Store = (*MySQLStore)(nil)
