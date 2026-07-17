package main

import (
	"testing"

	"github.com/gin-gonic/gin"
)

func TestConfigureTrustedProxiesAcceptsLoopbackAddresses(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()

	if err := configureTrustedProxies(router); err != nil {
		t.Fatalf("configure trusted proxies: %v", err)
	}
}
