package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type AppMySQLTemplateConfig struct {
	MySQLImage            string `json:"mysqlImage"`
	ExporterImage         string `json:"exporterImage,omitempty"`
	ImagePullSecret       string `json:"imagePullSecret,omitempty"`
	DefaultVersion        string `json:"defaultVersion,omitempty"`
	DefaultStorageSize    string `json:"defaultStorageSize,omitempty"`
	DefaultStorageClass   string `json:"defaultStorageClass,omitempty"`
	DefaultEnableExporter *bool  `json:"defaultEnableExporter,omitempty"`
}

type appMySQLTemplateRow struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	ConfigJSON  string `json:"-"`
	CreatedAt   string `json:"createdAt,omitempty"`
	UpdatedAt   string `json:"updatedAt,omitempty"`
	CreatedBy   string `json:"createdBy,omitempty"`
}

func parseAppMySQLTemplateConfig(raw string) (*AppMySQLTemplateConfig, error) {
	var c AppMySQLTemplateConfig
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return nil, err
	}
	return &c, nil
}

func validateAppMySQLTemplateConfig(c *AppMySQLTemplateConfig) error {
	if c == nil {
		return errors.New("template config is empty")
	}
	if strings.TrimSpace(c.MySQLImage) == "" {
		return errors.New("mysqlImage is required")
	}
	if strings.TrimSpace(c.DefaultVersion) != "" {
		return ValidateAppMySQLK8sEngineLine(c.DefaultVersion)
	}
	return nil
}

func appMySQLTemplateListFromMySQL(ctx context.Context, db *sql.DB) ([]appMySQLTemplateRow, error) {
	if db == nil {
		return nil, nil
	}
	rows, err := db.QueryContext(ctx, `SELECT id, name, description, config_json, created_at, updated_at, created_by FROM kubebt_app_mysql_templates ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []appMySQLTemplateRow
	for rows.Next() {
		var r appMySQLTemplateRow
		var desc sql.NullString
		var created, updated sql.NullTime
		if err := rows.Scan(&r.ID, &r.Name, &desc, &r.ConfigJSON, &created, &updated, &r.CreatedBy); err != nil {
			return nil, err
		}
		if desc.Valid {
			r.Description = desc.String
		}
		if created.Valid {
			r.CreatedAt = created.Time.UTC().Format(time.RFC3339)
		}
		if updated.Valid {
			r.UpdatedAt = updated.Time.UTC().Format(time.RFC3339)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func appMySQLTemplateGetByID(ctx context.Context, db *sql.DB, id int64) (*appMySQLTemplateRow, error) {
	var r appMySQLTemplateRow
	var desc sql.NullString
	var created, updated sql.NullTime
	err := db.QueryRowContext(ctx, `SELECT id, name, description, config_json, created_at, updated_at, created_by FROM kubebt_app_mysql_templates WHERE id=?`, id).
		Scan(&r.ID, &r.Name, &desc, &r.ConfigJSON, &created, &updated, &r.CreatedBy)
	if err != nil {
		return nil, err
	}
	if desc.Valid {
		r.Description = desc.String
	}
	if created.Valid {
		r.CreatedAt = created.Time.UTC().Format(time.RFC3339)
	}
	if updated.Valid {
		r.UpdatedAt = updated.Time.UTC().Format(time.RFC3339)
	}
	return &r, nil
}

func appMySQLTemplateInsert(ctx context.Context, db *sql.DB, name, description, configJSON, createdBy string) (int64, error) {
	res, err := db.ExecContext(ctx,
		`INSERT INTO kubebt_app_mysql_templates (name, description, config_json, created_by) VALUES (?,?,?,?)`,
		name, nullIfEmpty(description), configJSON, createdBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func appMySQLTemplateUpdate(ctx context.Context, db *sql.DB, id int64, name, description, configJSON string) error {
	_, err := db.ExecContext(ctx,
		`UPDATE kubebt_app_mysql_templates SET name=?, description=?, config_json=? WHERE id=?`,
		name, nullIfEmpty(description), configJSON, id)
	return err
}

func appMySQLTemplateDelete(ctx context.Context, db *sql.DB, id int64) error {
	_, err := db.ExecContext(ctx, `DELETE FROM kubebt_app_mysql_templates WHERE id=?`, id)
	return err
}

func appMySQLTemplateRowToPublic(row appMySQLTemplateRow) (map[string]interface{}, error) {
	cfg, err := parseAppMySQLTemplateConfig(row.ConfigJSON)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"id":          row.ID,
		"name":        row.Name,
		"description": row.Description,
		"config":      cfg,
		"createdAt":   row.CreatedAt,
		"updatedAt":   row.UpdatedAt,
		"createdBy":   row.CreatedBy,
	}, nil
}
