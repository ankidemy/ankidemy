package dao

import "gorm.io/gorm"

type PGQueryStat struct {
	QueryID          string  `json:"queryId" gorm:"column:query_id"`
	Calls            int64   `json:"calls" gorm:"column:calls"`
	TotalExecTimeMS  float64 `json:"totalExecTimeMs" gorm:"column:total_exec_time_ms"`
	MeanExecTimeMS   float64 `json:"meanExecTimeMs" gorm:"column:mean_exec_time_ms"`
	P95EstExecTimeMS float64 `json:"p95EstExecTimeMs" gorm:"column:p95_est_exec_time_ms"`
	TotalRows        int64   `json:"totalRows" gorm:"column:total_rows"`
	Query            string  `json:"query" gorm:"column:query"`
}

type PGStatStatementsDAO struct {
	db *gorm.DB
}

func NewPGStatStatementsDAO(db *gorm.DB) *PGStatStatementsDAO {
	return &PGStatStatementsDAO{db: db}
}

func (d *PGStatStatementsDAO) TopQueries(limit int, queryFilter string) ([]PGQueryStat, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 200 {
		limit = 200
	}
	if queryFilter == "" {
		queryFilter = "%"
	}

	sql := `
		SELECT
			COALESCE(queryid::text, '') AS query_id,
			calls,
			ROUND(total_exec_time::numeric, 3) AS total_exec_time_ms,
			ROUND(mean_exec_time::numeric, 3) AS mean_exec_time_ms,
			ROUND((mean_exec_time + (1.645 * COALESCE(stddev_exec_time, 0)))::numeric, 3) AS p95_est_exec_time_ms,
			rows AS total_rows,
			LEFT(REGEXP_REPLACE(query, '\s+', ' ', 'g'), 1200) AS query
		FROM pg_stat_statements
		WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
			AND query ILIKE ?
		ORDER BY total_exec_time DESC
		LIMIT ?
	`

	var stats []PGQueryStat
	if err := d.db.Raw(sql, queryFilter, limit).Scan(&stats).Error; err != nil {
		return nil, err
	}
	return stats, nil
}
