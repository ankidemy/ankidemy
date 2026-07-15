package services

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type CachePolicy struct {
	TTL  time.Duration
	Tags []string
}

type queryCacheBackend interface {
	Get(ctx context.Context, key string) ([]byte, bool, error)
	Set(ctx context.Context, key string, payload []byte, ttl time.Duration, tags []string) error
	InvalidateTag(ctx context.Context, tag string) error
}

type QueryCacheService struct {
	backend queryCacheBackend
	lockMu  sync.Mutex
	locks   map[string]*sync.Mutex
}

func NewQueryCacheService(backend queryCacheBackend) *QueryCacheService {
	return &QueryCacheService{
		backend: backend,
		locks:   make(map[string]*sync.Mutex),
	}
}

func NewQueryCacheServiceFromEnv() *QueryCacheService {
	addr := strings.TrimSpace(os.Getenv("REDIS_ADDR"))
	if addr == "" {
		return NewQueryCacheService(newNoopCacheBackend())
	}

	redisDB := 0
	if raw := strings.TrimSpace(os.Getenv("REDIS_DB")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err == nil {
			redisDB = parsed
		}
	}

	client := &redisRESPClient{
		addr:     addr,
		password: os.Getenv("REDIS_PASSWORD"),
		db:       redisDB,
		timeout:  2 * time.Second,
	}
	if err := client.Ping(context.Background()); err != nil {
		log.Printf("warning: redis ping failed (%v); falling back to no-op cache", err)
		return NewQueryCacheService(newNoopCacheBackend())
	}

	prefix := strings.TrimSpace(os.Getenv("REDIS_CACHE_PREFIX"))
	if prefix == "" {
		prefix = "ankidemy"
	}

	return NewQueryCacheService(newRedisCacheBackend(client, prefix))
}

func CacheGetOrLoadJSON[T any](
	ctx context.Context,
	s *QueryCacheService,
	key string,
	policy CachePolicy,
	requestID string,
	route string,
	loader func(context.Context) (T, error),
) (T, error) {
	var zero T
	const serviceMethod = "QueryCacheService.CacheGetOrLoadJSON"
	if s == nil || s.backend == nil || policy.TTL <= 0 {
		loaderStartedAt := time.Now()
		loaded, err := loader(ctx)
		logServiceStage(
			requestID,
			route,
			serviceMethod,
			"load_without_cache",
			loaderStartedAt,
			err,
			map[string]interface{}{"cacheKey": key},
		)
		if err != nil {
			return zero, err
		}
		return loaded, nil
	}

	initialGetStartedAt := time.Now()
	payload, hit, err := s.backend.Get(ctx, key)
	logServiceStage(
		requestID,
		route,
		serviceMethod,
		"cache_get_initial",
		initialGetStartedAt,
		err,
		map[string]interface{}{"cacheKey": key, "hit": hit},
	)
	if err == nil && hit {
		unmarshalStartedAt := time.Now()
		var cached T
		if err := json.Unmarshal(payload, &cached); err == nil {
			logServiceStage(
				requestID,
				route,
				serviceMethod,
				"cache_unmarshal_initial",
				unmarshalStartedAt,
				nil,
				map[string]interface{}{"cacheKey": key, "hit": true},
			)
			return cached, nil
		}
		logServiceStage(
			requestID,
			route,
			serviceMethod,
			"cache_unmarshal_initial",
			unmarshalStartedAt,
			err,
			map[string]interface{}{"cacheKey": key, "hit": true},
		)
	}

	lock := s.getLock(key)
	lockWaitStartedAt := time.Now()
	lock.Lock()
	logServiceStage(
		requestID,
		route,
		serviceMethod,
		"cache_lock_wait",
		lockWaitStartedAt,
		nil,
		map[string]interface{}{"cacheKey": key},
	)
	defer lock.Unlock()

	recheckGetStartedAt := time.Now()
	payload, hit, err = s.backend.Get(ctx, key)
	logServiceStage(
		requestID,
		route,
		serviceMethod,
		"cache_get_after_lock",
		recheckGetStartedAt,
		err,
		map[string]interface{}{"cacheKey": key, "hit": hit},
	)
	if err == nil && hit {
		unmarshalStartedAt := time.Now()
		var cached T
		if err := json.Unmarshal(payload, &cached); err == nil {
			logServiceStage(
				requestID,
				route,
				serviceMethod,
				"cache_unmarshal_after_lock",
				unmarshalStartedAt,
				nil,
				map[string]interface{}{"cacheKey": key, "hit": true},
			)
			return cached, nil
		}
		logServiceStage(
			requestID,
			route,
			serviceMethod,
			"cache_unmarshal_after_lock",
			unmarshalStartedAt,
			err,
			map[string]interface{}{"cacheKey": key, "hit": true},
		)
	}

	loaderStartedAt := time.Now()
	loaded, err := loader(ctx)
	logServiceStage(
		requestID,
		route,
		serviceMethod,
		"cache_loader",
		loaderStartedAt,
		err,
		map[string]interface{}{"cacheKey": key},
	)
	if err != nil {
		return zero, err
	}

	marshalStartedAt := time.Now()
	payload, err = json.Marshal(loaded)
	logServiceStage(
		requestID,
		route,
		serviceMethod,
		"cache_marshal_loaded",
		marshalStartedAt,
		err,
		map[string]interface{}{"cacheKey": key},
	)
	if err != nil {
		return zero, err
	}

	setStartedAt := time.Now()
	if err := s.backend.Set(ctx, key, payload, policy.TTL, policy.Tags); err != nil {
		logServiceStage(
			requestID,
			route,
			serviceMethod,
			"cache_set",
			setStartedAt,
			err,
			map[string]interface{}{"cacheKey": key, "tagCount": len(policy.Tags)},
		)
		log.Printf("warning: cache set failed for key=%s: %v", key, err)
	} else {
		logServiceStage(
			requestID,
			route,
			serviceMethod,
			"cache_set",
			setStartedAt,
			nil,
			map[string]interface{}{"cacheKey": key, "tagCount": len(policy.Tags)},
		)
	}
	return loaded, nil
}

func (s *QueryCacheService) getLock(key string) *sync.Mutex {
	s.lockMu.Lock()
	defer s.lockMu.Unlock()
	if lock, exists := s.locks[key]; exists {
		return lock
	}
	lock := &sync.Mutex{}
	s.locks[key] = lock
	return lock
}

func (s *QueryCacheService) InvalidateTag(ctx context.Context, tag string) error {
	if s == nil || s.backend == nil {
		return nil
	}
	if strings.TrimSpace(tag) == "" {
		return nil
	}
	return s.backend.InvalidateTag(ctx, tag)
}

type redisCacheBackend struct {
	client *redisRESPClient
	prefix string
}

func newRedisCacheBackend(client *redisRESPClient, prefix string) *redisCacheBackend {
	return &redisCacheBackend{client: client, prefix: prefix}
}

func (b *redisCacheBackend) key(raw string) string {
	return fmt.Sprintf("%s:cache:item:%s", b.prefix, raw)
}

func (b *redisCacheBackend) tagKey(tag string) string {
	return fmt.Sprintf("%s:cache:tag:%s", b.prefix, tag)
}

func (b *redisCacheBackend) Get(ctx context.Context, key string) ([]byte, bool, error) {
	value, found, err := b.client.Get(ctx, b.key(key))
	if err != nil {
		return nil, false, err
	}
	if !found {
		return nil, false, nil
	}
	return value, true, nil
}

func (b *redisCacheBackend) Set(ctx context.Context, key string, payload []byte, ttl time.Duration, tags []string) error {
	cacheKey := b.key(key)
	if ttl <= 0 {
		ttl = 1 * time.Second
	}
	if err := b.client.SetEX(ctx, cacheKey, payload, ttl); err != nil {
		return err
	}

	tagTTL := ttl + 30*time.Second
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		tk := b.tagKey(tag)
		if err := b.client.SAdd(ctx, tk, cacheKey); err != nil {
			return err
		}
		if err := b.client.Expire(ctx, tk, tagTTL); err != nil {
			return err
		}
	}
	return nil
}

func (b *redisCacheBackend) InvalidateTag(ctx context.Context, tag string) error {
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return nil
	}
	tk := b.tagKey(tag)
	keys, err := b.client.SMembers(ctx, tk)
	if err != nil {
		return err
	}
	if len(keys) > 0 {
		if err := b.client.Del(ctx, keys...); err != nil {
			return err
		}
	}
	return b.client.Del(ctx, tk)
}

type noopCacheBackend struct{}

func newNoopCacheBackend() *noopCacheBackend {
	return &noopCacheBackend{}
}

func (b *noopCacheBackend) Get(context.Context, string) ([]byte, bool, error) {
	return nil, false, nil
}

func (b *noopCacheBackend) Set(context.Context, string, []byte, time.Duration, []string) error {
	return nil
}

func (b *noopCacheBackend) InvalidateTag(context.Context, string) error {
	return nil
}

type redisRESPClient struct {
	addr     string
	password string
	db       int
	timeout  time.Duration
}

func (c *redisRESPClient) Ping(ctx context.Context) error {
	resp, err := c.call(ctx, "PING")
	if err != nil {
		return err
	}
	if resp.typ != '+' || strings.ToUpper(resp.simple) != "PONG" {
		return fmt.Errorf("unexpected redis ping response")
	}
	return nil
}

func (c *redisRESPClient) Get(ctx context.Context, key string) ([]byte, bool, error) {
	resp, err := c.call(ctx, "GET", key)
	if err != nil {
		return nil, false, err
	}
	if resp.typ == '$' && resp.nil {
		return nil, false, nil
	}
	if resp.typ != '$' {
		return nil, false, fmt.Errorf("unexpected GET response type: %c", resp.typ)
	}
	return resp.bulk, true, nil
}

func (c *redisRESPClient) SetEX(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	secs := int(ttl.Seconds())
	if secs <= 0 {
		secs = 1
	}
	resp, err := c.callBytes(ctx, []string{"SET", key, string(value), "EX", strconv.Itoa(secs)})
	if err != nil {
		return err
	}
	if resp.typ != '+' {
		return fmt.Errorf("unexpected SET response type: %c", resp.typ)
	}
	return nil
}

func (c *redisRESPClient) Del(ctx context.Context, keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	args := append([]string{"DEL"}, keys...)
	resp, err := c.call(ctx, args...)
	if err != nil {
		return err
	}
	if resp.typ != ':' {
		return fmt.Errorf("unexpected DEL response type: %c", resp.typ)
	}
	return nil
}

func (c *redisRESPClient) SAdd(ctx context.Context, key string, member string) error {
	resp, err := c.call(ctx, "SADD", key, member)
	if err != nil {
		return err
	}
	if resp.typ != ':' {
		return fmt.Errorf("unexpected SADD response type: %c", resp.typ)
	}
	return nil
}

func (c *redisRESPClient) Expire(ctx context.Context, key string, ttl time.Duration) error {
	secs := int(ttl.Seconds())
	if secs <= 0 {
		secs = 1
	}
	resp, err := c.call(ctx, "EXPIRE", key, strconv.Itoa(secs))
	if err != nil {
		return err
	}
	if resp.typ != ':' {
		return fmt.Errorf("unexpected EXPIRE response type: %c", resp.typ)
	}
	return nil
}

func (c *redisRESPClient) SMembers(ctx context.Context, key string) ([]string, error) {
	resp, err := c.call(ctx, "SMEMBERS", key)
	if err != nil {
		return nil, err
	}
	if resp.typ == '*' && resp.nil {
		return []string{}, nil
	}
	if resp.typ != '*' {
		return nil, fmt.Errorf("unexpected SMEMBERS response type: %c", resp.typ)
	}
	results := make([]string, 0, len(resp.array))
	for _, item := range resp.array {
		if item.typ == '$' && !item.nil {
			results = append(results, string(item.bulk))
		}
	}
	return results, nil
}

func (c *redisRESPClient) call(ctx context.Context, args ...string) (respValue, error) {
	return c.callBytes(ctx, args)
}

func (c *redisRESPClient) callBytes(ctx context.Context, args []string) (respValue, error) {
	var zero respValue
	conn, err := net.DialTimeout("tcp", c.addr, c.timeout)
	if err != nil {
		return zero, err
	}
	defer func() { _ = conn.Close() }()

	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	} else {
		_ = conn.SetDeadline(time.Now().Add(c.timeout))
	}

	rw := bufio.NewReadWriter(bufio.NewReader(conn), bufio.NewWriter(conn))

	if strings.TrimSpace(c.password) != "" {
		if err := writeRESPCommand(rw.Writer, "AUTH", c.password); err != nil {
			return zero, err
		}
		if err := rw.Flush(); err != nil {
			return zero, err
		}
		if _, err := readRESP(rw.Reader); err != nil {
			return zero, err
		}
	}

	if c.db > 0 {
		if err := writeRESPCommand(rw.Writer, "SELECT", strconv.Itoa(c.db)); err != nil {
			return zero, err
		}
		if err := rw.Flush(); err != nil {
			return zero, err
		}
		if _, err := readRESP(rw.Reader); err != nil {
			return zero, err
		}
	}

	if err := writeRESPCommand(rw.Writer, args...); err != nil {
		return zero, err
	}
	if err := rw.Flush(); err != nil {
		return zero, err
	}
	return readRESP(rw.Reader)
}

type respValue struct {
	typ    byte
	simple string
	bulk   []byte
	intval int64
	array  []respValue
	nil    bool
}

func writeRESPCommand(w *bufio.Writer, args ...string) error {
	if _, err := fmt.Fprintf(w, "*%d\r\n", len(args)); err != nil {
		return err
	}
	for _, arg := range args {
		if _, err := fmt.Fprintf(w, "$%d\r\n", len(arg)); err != nil {
			return err
		}
		if _, err := w.WriteString(arg); err != nil {
			return err
		}
		if _, err := w.WriteString("\r\n"); err != nil {
			return err
		}
	}
	return nil
}

func readRESP(r *bufio.Reader) (respValue, error) {
	var zero respValue
	prefix, err := r.ReadByte()
	if err != nil {
		return zero, err
	}
	switch prefix {
	case '+':
		line, err := readLine(r)
		if err != nil {
			return zero, err
		}
		return respValue{typ: '+', simple: line}, nil
	case '-':
		line, err := readLine(r)
		if err != nil {
			return zero, err
		}
		return zero, errors.New(line)
	case ':':
		line, err := readLine(r)
		if err != nil {
			return zero, err
		}
		intval, err := strconv.ParseInt(line, 10, 64)
		if err != nil {
			return zero, err
		}
		return respValue{typ: ':', intval: intval}, nil
	case '$':
		line, err := readLine(r)
		if err != nil {
			return zero, err
		}
		length, err := strconv.Atoi(line)
		if err != nil {
			return zero, err
		}
		if length == -1 {
			return respValue{typ: '$', nil: true}, nil
		}
		payload := make([]byte, length+2)
		if _, err := io.ReadFull(r, payload); err != nil {
			return zero, err
		}
		return respValue{typ: '$', bulk: payload[:length]}, nil
	case '*':
		line, err := readLine(r)
		if err != nil {
			return zero, err
		}
		count, err := strconv.Atoi(line)
		if err != nil {
			return zero, err
		}
		if count == -1 {
			return respValue{typ: '*', nil: true}, nil
		}
		values := make([]respValue, 0, count)
		for i := 0; i < count; i++ {
			value, err := readRESP(r)
			if err != nil {
				return zero, err
			}
			values = append(values, value)
		}
		return respValue{typ: '*', array: values}, nil
	default:
		return zero, fmt.Errorf("unknown redis response prefix: %q", prefix)
	}
}

func readLine(r *bufio.Reader) (string, error) {
	line, err := r.ReadString('\n')
	if err != nil {
		return "", err
	}
	line = strings.TrimSuffix(line, "\n")
	line = strings.TrimSuffix(line, "\r")
	return line, nil
}
