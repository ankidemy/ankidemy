package middleware

import (
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimitPolicy defines a fixed-window throttle policy for a route.
type RateLimitPolicy struct {
	Scope       string
	MaxRequests int
	Window      time.Duration
}

type rateLimitEntry struct {
	count   int
	resetAt time.Time
}

// AbuseLimiter keeps lightweight in-memory counters for the current server instance.
// This is intentionally scoped to the single-instance beta deployment model.
type AbuseLimiter struct {
	mu        sync.Mutex
	entries   map[string]rateLimitEntry
	lastSweep time.Time
	now       func() time.Time
}

func NewAbuseLimiter() *AbuseLimiter {
	return &AbuseLimiter{
		entries: make(map[string]rateLimitEntry),
		now:     time.Now,
	}
}

func (l *AbuseLimiter) Allow(scope, subject string, policy RateLimitPolicy) (bool, time.Duration, int) {
	if l == nil || policy.MaxRequests <= 0 || policy.Window <= 0 {
		return true, 0, 0
	}

	if subject == "" {
		subject = "anonymous"
	}

	now := l.now()
	key := scope + "|" + subject

	l.mu.Lock()
	defer l.mu.Unlock()

	l.sweepExpiredLocked(now)

	entry, exists := l.entries[key]
	if !exists || !now.Before(entry.resetAt) {
		entry = rateLimitEntry{
			count:   0,
			resetAt: now.Add(policy.Window),
		}
	}

	if entry.count >= policy.MaxRequests {
		l.entries[key] = entry
		retryAfter := entry.resetAt.Sub(now)
		if retryAfter < 0 {
			retryAfter = 0
		}
		return false, retryAfter, 0
	}

	entry.count++
	l.entries[key] = entry

	remaining := policy.MaxRequests - entry.count
	if remaining < 0 {
		remaining = 0
	}

	return true, 0, remaining
}

func (l *AbuseLimiter) sweepExpiredLocked(now time.Time) {
	if len(l.entries) == 0 {
		l.lastSweep = now
		return
	}
	if !l.lastSweep.IsZero() && now.Sub(l.lastSweep) < time.Minute {
		return
	}
	for key, entry := range l.entries {
		if !now.Before(entry.resetAt) {
			delete(l.entries, key)
		}
	}
	l.lastSweep = now
}

func AbuseThrottle(limiter *AbuseLimiter, policy RateLimitPolicy) gin.HandlerFunc {
	return func(c *gin.Context) {
		if limiter == nil || policy.MaxRequests <= 0 || policy.Window <= 0 {
			c.Next()
			return
		}

		subject := abuseThrottleSubject(c)
		allowed, retryAfter, remaining := limiter.Allow(policy.Scope, subject, policy)
		c.Writer.Header().Set("X-Abuse-Limit", strconv.Itoa(policy.MaxRequests))

		if allowed {
			c.Writer.Header().Set("X-Abuse-Remaining", strconv.Itoa(remaining))
			c.Next()
			return
		}

		retryAfterSeconds := int(retryAfter / time.Second)
		if retryAfter%time.Second != 0 {
			retryAfterSeconds++
		}
		if retryAfterSeconds < 1 {
			retryAfterSeconds = 1
		}

		route := c.FullPath()
		if route == "" {
			route = c.Request.URL.Path
		}

		c.Writer.Header().Set("X-Abuse-Remaining", "0")
		c.Writer.Header().Set("Retry-After", strconv.Itoa(retryAfterSeconds))

		log.Printf(
			"{\"type\":\"abuse_throttle\",\"requestId\":%q,\"route\":%q,\"scope\":%q,\"subject\":%q,\"retryAfterSeconds\":%d}",
			GetRequestID(c),
			route,
			policy.Scope,
			subject,
			retryAfterSeconds,
		)

		c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "Too many requests"})
	}
}

func abuseThrottleSubject(c *gin.Context) string {
	if c == nil {
		return "anonymous"
	}
	if userID, ok := c.Get("userID"); ok {
		if normalized := formatUserID(userID); normalized != "" {
			return "user:" + normalized
		}
	}
	if clientIP := c.ClientIP(); clientIP != "" {
		return "ip:" + clientIP
	}
	return "anonymous"
}
