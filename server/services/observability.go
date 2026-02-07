package services

import (
	"encoding/json"
	"log"
	"time"
)

type serviceStageEvent struct {
	Type          string                 `json:"type"`
	Timestamp     string                 `json:"timestamp"`
	RequestID     string                 `json:"requestId,omitempty"`
	Route         string                 `json:"route,omitempty"`
	ServiceMethod string                 `json:"serviceMethod"`
	Stage         string                 `json:"stage"`
	Duration      float64                `json:"durationMs"`
	Error         string                 `json:"error,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

func logServiceStage(
	requestID string,
	route string,
	serviceMethod string,
	stage string,
	startedAt time.Time,
	err error,
	metadata map[string]interface{},
) {
	event := serviceStageEvent{
		Type:          "service_stage",
		Timestamp:     time.Now().UTC().Format(time.RFC3339Nano),
		RequestID:     requestID,
		Route:         route,
		ServiceMethod: serviceMethod,
		Stage:         stage,
		Duration:      float64(time.Since(startedAt).Microseconds()) / 1000.0,
		Metadata:      metadata,
	}
	if err != nil {
		event.Error = err.Error()
	}

	payload, marshalErr := json.Marshal(event)
	if marshalErr != nil {
		log.Printf("{\"type\":\"service_stage_log_error\",\"error\":%q}", marshalErr.Error())
		return
	}
	log.Println(string(payload))
}
