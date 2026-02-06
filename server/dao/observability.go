package dao

import (
	"encoding/json"
	"log"
	"time"
)

type daoStageEvent struct {
	Type      string                 `json:"type"`
	Timestamp string                 `json:"timestamp"`
	RequestID string                 `json:"requestId,omitempty"`
	Route     string                 `json:"route,omitempty"`
	DAOMethod string                 `json:"daoMethod"`
	Stage     string                 `json:"stage"`
	Duration  float64                `json:"durationMs"`
	Error     string                 `json:"error,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

func logDAOStage(
	requestID string,
	route string,
	daoMethod string,
	stage string,
	startedAt time.Time,
	err error,
	metadata map[string]interface{},
) {
	event := daoStageEvent{
		Type:      "dao_stage",
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		RequestID: requestID,
		Route:     route,
		DAOMethod: daoMethod,
		Stage:     stage,
		Duration:  float64(time.Since(startedAt).Microseconds()) / 1000.0,
		Metadata:  metadata,
	}
	if err != nil {
		event.Error = err.Error()
	}

	payload, marshalErr := json.Marshal(event)
	if marshalErr != nil {
		log.Printf("{\"type\":\"dao_stage_log_error\",\"error\":%q}", marshalErr.Error())
		return
	}
	log.Println(string(payload))
}
