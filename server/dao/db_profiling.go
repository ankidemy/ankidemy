package dao

import (
	"log"
	"strings"

	"gorm.io/gorm"
)

func ensurePGStatStatements(db *gorm.DB) {
	if err := db.Exec("CREATE EXTENSION IF NOT EXISTS pg_stat_statements;").Error; err != nil {
		log.Printf("DB profiling note: could not create extension pg_stat_statements: %v", err)
		return
	}

	var sharedPreload string
	row := db.Raw("SELECT current_setting('shared_preload_libraries');").Row()
	if err := row.Scan(&sharedPreload); err != nil {
		log.Printf("DB profiling note: could not inspect shared_preload_libraries: %v", err)
		return
	}

	if !strings.Contains(sharedPreload, "pg_stat_statements") {
		log.Printf("DB profiling note: shared_preload_libraries is missing pg_stat_statements; enable it and restart PostgreSQL for full metrics")
	}
}
