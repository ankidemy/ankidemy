package services

import (
	"context"
	"fmt"
	"log"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"ankidemy/server/dao"
	"ankidemy/server/models"
	"gorm.io/gorm"
)

const (
	ReadModelEventNotificationDomainDueRefresh  = "notifications.domain_due.refresh"
	ReadModelEventNotificationSummaryInvalidate = "notifications.summary.invalidate"
	notificationSummaryRoute                    = "/api/srs/notifications/summary"
)

type NotificationReadModelService struct {
	db            *gorm.DB
	inviteDAO     *dao.DomainInviteDAO
	eventDAO      *dao.ReadModelEventDAO
	dueDAO        *dao.UserDomainDueProjectionDAO
	queryCache    *QueryCacheService
	cacheTTL      time.Duration
	staleAfter    time.Duration
	workerBatch   int
	workerEvery   time.Duration
	workerRunning bool
}

func NewNotificationReadModelService(db *gorm.DB, queryCache *QueryCacheService) *NotificationReadModelService {
	return &NotificationReadModelService{
		db:         db,
		inviteDAO:  dao.NewDomainInviteDAO(db),
		eventDAO:   dao.NewReadModelEventDAO(db),
		dueDAO:     dao.NewUserDomainDueProjectionDAO(db),
		queryCache: queryCache,
		cacheTTL:   envDuration("NOTIFICATIONS_SUMMARY_CACHE_TTL", 60*time.Second),
		staleAfter: envDuration("NOTIFICATIONS_DUE_PROJECTION_STALE_AFTER", 10*time.Minute),
		workerBatch: envInt(
			"READ_MODEL_WORKER_BATCH_SIZE",
			128,
		),
		workerEvery: envDuration("READ_MODEL_WORKER_INTERVAL", 2*time.Second),
	}
}

func (s *NotificationReadModelService) StartWorker() {
	if s == nil || s.workerRunning {
		return
	}
	s.workerRunning = true
	go s.runWorkerLoop()
}

func (s *NotificationReadModelService) runWorkerLoop() {
	ticker := time.NewTicker(s.workerEvery)
	defer ticker.Stop()
	for {
		if err := s.processReadyEvents(); err != nil {
			log.Printf("warning: notification read-model worker tick failed: %v", err)
		}
		<-ticker.C
	}
}

func (s *NotificationReadModelService) processReadyEvents() error {
	events, err := s.eventDAO.ListReady(s.workerBatch, time.Now().UTC())
	if err != nil {
		return err
	}
	for _, event := range events {
		if err := s.handleEvent(event); err != nil {
			backoff := time.Duration(event.RetryCount+1) * 5 * time.Second
			if backoff > 60*time.Second {
				backoff = 60 * time.Second
			}
			_ = s.eventDAO.Reschedule(event.ID, backoff, err.Error())
			continue
		}
		_ = s.eventDAO.DeleteByID(event.ID)
	}
	return nil
}

func (s *NotificationReadModelService) handleEvent(event models.ReadModelEvent) error {
	switch event.EventType {
	case ReadModelEventNotificationDomainDueRefresh:
		if event.DomainID == nil {
			return fmt.Errorf("domain_due.refresh event missing domainId")
		}
		dueCount, err := s.dueDAO.ComputeDueCount(event.UserID, *event.DomainID)
		if err != nil {
			return err
		}
		if err := s.dueDAO.UpsertDueCount(event.UserID, *event.DomainID, dueCount, time.Now().UTC()); err != nil {
			return err
		}
		return s.invalidateSummaryCache(event.UserID)
	case ReadModelEventNotificationSummaryInvalidate:
		return s.invalidateSummaryCache(event.UserID)
	default:
		// Unknown event types are considered consumed to avoid queue poison.
		return nil
	}
}

func (s *NotificationReadModelService) GetSummary(userID uint, requestID string) (*models.NotificationSummary, error) {
	if s == nil {
		return nil, fmt.Errorf("notification read model service is nil")
	}
	const serviceMethod = "NotificationReadModelService.GetSummary"

	key := s.summaryCacheKey(userID)
	tag := s.summaryCacheTag(userID)

	cacheLoadStartedAt := time.Now()
	summary, err := CacheGetOrLoadJSON(context.Background(), s.queryCache, key, CachePolicy{
		TTL:  s.cacheTTL,
		Tags: []string{tag},
	}, requestID, notificationSummaryRoute, func(ctx context.Context) (*models.NotificationSummary, error) {
		return s.buildSummary(ctx, userID, requestID)
	})
	logServiceStage(
		requestID,
		notificationSummaryRoute,
		serviceMethod,
		"summary_cache_get_or_load",
		cacheLoadStartedAt,
		err,
		map[string]interface{}{
			"userId":         userID,
			"cacheKey":       key,
			"cacheTTLSecond": int(s.cacheTTL.Seconds()),
		},
	)
	if err != nil {
		return nil, err
	}
	return summary, nil
}

func (s *NotificationReadModelService) buildSummary(_ context.Context, userID uint, requestID string) (*models.NotificationSummary, error) {
	const serviceMethod = "NotificationReadModelService.buildSummary"

	domainsStartedAt := time.Now()
	domains, err := s.dueDAO.ListNotificationDomains(userID)
	logServiceStage(
		requestID,
		notificationSummaryRoute,
		serviceMethod,
		"list_notification_domains",
		domainsStartedAt,
		err,
		map[string]interface{}{"userId": userID, "domainCount": len(domains)},
	)
	if err != nil {
		return nil, err
	}

	domainIDs := make([]uint, 0, len(domains))
	for _, domain := range domains {
		domainIDs = append(domainIDs, domain.DomainID)
	}

	projectionStartedAt := time.Now()
	projectedByDomain, err := s.dueDAO.GetByUserAndDomainIDs(userID, domainIDs)
	logServiceStage(
		requestID,
		notificationSummaryRoute,
		serviceMethod,
		"get_due_projections",
		projectionStartedAt,
		err,
		map[string]interface{}{"userId": userID, "domainCount": len(domainIDs), "projectionCount": len(projectedByDomain)},
	)
	if err != nil {
		return nil, err
	}

	staleScanStartedAt := time.Now()
	staleOrMissing := make([]uint, 0, len(domainIDs))
	staleThreshold := time.Now().UTC().Add(-s.staleAfter)
	for _, domainID := range domainIDs {
		projected, exists := projectedByDomain[domainID]
		if !exists || projected.ComputedAt.Before(staleThreshold) {
			staleOrMissing = append(staleOrMissing, domainID)
		}
	}
	logServiceStage(
		requestID,
		notificationSummaryRoute,
		serviceMethod,
		"detect_stale_or_missing_projections",
		staleScanStartedAt,
		nil,
		map[string]interface{}{"userId": userID, "domainCount": len(domainIDs), "staleOrMissingCount": len(staleOrMissing)},
	)

	if len(staleOrMissing) > 0 {
		computeDueStartedAt := time.Now()
		freshDueCounts, err := s.dueDAO.ComputeDueCounts(userID, staleOrMissing)
		logServiceStage(
			requestID,
			notificationSummaryRoute,
			serviceMethod,
			"compute_due_counts",
			computeDueStartedAt,
			err,
			map[string]interface{}{"userId": userID, "domainCount": len(staleOrMissing), "resultCount": len(freshDueCounts)},
		)
		if err != nil {
			return nil, err
		}
		upsertStartedAt := time.Now()
		if err := s.dueDAO.UpsertDueCounts(userID, freshDueCounts, time.Now().UTC()); err != nil {
			logServiceStage(
				requestID,
				notificationSummaryRoute,
				serviceMethod,
				"upsert_due_projections",
				upsertStartedAt,
				err,
				map[string]interface{}{"userId": userID, "projectionCount": len(freshDueCounts)},
			)
			return nil, err
		}
		logServiceStage(
			requestID,
			notificationSummaryRoute,
			serviceMethod,
			"upsert_due_projections",
			upsertStartedAt,
			nil,
			map[string]interface{}{"userId": userID, "projectionCount": len(freshDueCounts)},
		)
		for domainID, dueCount := range freshDueCounts {
			projectedByDomain[domainID] = models.UserDomainDueProjection{
				UserID:     userID,
				DomainID:   domainID,
				DueReviews: dueCount,
				ComputedAt: time.Now().UTC(),
			}
		}
	}

	buildDomainSummaryStartedAt := time.Now()
	domainSummaries := make([]models.NotificationSummaryDomain, 0, len(domains))
	totalDue := 0
	for _, domain := range domains {
		dueCount := 0
		if projected, exists := projectedByDomain[domain.DomainID]; exists {
			dueCount = projected.DueReviews
		}
		totalDue += dueCount
		domainSummaries = append(domainSummaries, models.NotificationSummaryDomain{
			DomainID:   domain.DomainID,
			DomainName: domain.DomainName,
			DueCount:   dueCount,
		})
	}
	logServiceStage(
		requestID,
		notificationSummaryRoute,
		serviceMethod,
		"build_domain_summaries",
		buildDomainSummaryStartedAt,
		nil,
		map[string]interface{}{"userId": userID, "domainCount": len(domainSummaries), "totalDue": totalDue},
	)

	sortStartedAt := time.Now()
	sort.Slice(domainSummaries, func(i, j int) bool {
		if domainSummaries[i].DueCount == domainSummaries[j].DueCount {
			return domainSummaries[i].DomainID < domainSummaries[j].DomainID
		}
		return domainSummaries[i].DueCount > domainSummaries[j].DueCount
	})
	logServiceStage(
		requestID,
		notificationSummaryRoute,
		serviceMethod,
		"sort_domain_summaries",
		sortStartedAt,
		nil,
		map[string]interface{}{"userId": userID, "domainCount": len(domainSummaries)},
	)

	invitesStartedAt := time.Now()
	invites, err := s.inviteDAO.ListPendingForUser(userID, requestID, notificationSummaryRoute)
	logServiceStage(
		requestID,
		notificationSummaryRoute,
		serviceMethod,
		"list_pending_invites_total",
		invitesStartedAt,
		err,
		map[string]interface{}{"userId": userID, "inviteCount": len(invites)},
	)
	if err != nil {
		return nil, err
	}
	buildInviteSummaryStartedAt := time.Now()
	inviteSummaries := make([]models.NotificationSummaryInvite, 0, len(invites))
	for _, invite := range invites {
		domainName := ""
		if invite.Domain != nil {
			domainName = invite.Domain.Name
		}
		inviterName := ""
		if invite.Inviter != nil {
			inviterName = invite.Inviter.Username
		}
		inviteSummaries = append(inviteSummaries, models.NotificationSummaryInvite{
			ID:                invite.ID,
			DomainID:          invite.DomainID,
			DomainName:        domainName,
			InvitedBy:         invite.InvitedBy,
			InvitedByUsername: inviterName,
			Role:              invite.Role,
			CreatedAt:         invite.CreatedAt,
		})
	}
	logServiceStage(
		requestID,
		notificationSummaryRoute,
		serviceMethod,
		"build_invite_summaries",
		buildInviteSummaryStartedAt,
		nil,
		map[string]interface{}{"userId": userID, "inviteCount": len(inviteSummaries)},
	)

	assembleSummaryStartedAt := time.Now()
	summary := &models.NotificationSummary{
		Domains:     domainSummaries,
		Invites:     inviteSummaries,
		TotalDue:    totalDue,
		InviteCount: len(inviteSummaries),
		GeneratedAt: time.Now().UTC(),
	}
	logServiceStage(
		requestID,
		notificationSummaryRoute,
		serviceMethod,
		"assemble_summary_response",
		assembleSummaryStartedAt,
		nil,
		map[string]interface{}{"userId": userID, "domainCount": len(domainSummaries), "inviteCount": len(inviteSummaries)},
	)

	return summary, nil
}

func (s *NotificationReadModelService) EnqueueDomainDueRefresh(userID uint, domainID uint) error {
	return s.enqueueDomainDueRefreshWithDB(s.db, userID, domainID)
}

func (s *NotificationReadModelService) EnqueueDomainDueRefreshTx(tx *gorm.DB, userID uint, domainID uint) error {
	return s.enqueueDomainDueRefreshWithDB(tx, userID, domainID)
}

func (s *NotificationReadModelService) enqueueDomainDueRefreshWithDB(db *gorm.DB, userID uint, domainID uint) error {
	if s == nil || db == nil {
		return nil
	}
	notBefore := time.Now().UTC()
	event := &models.ReadModelEvent{
		DedupeKey: fmt.Sprintf("notifications:due:user:%d:domain:%d", userID, domainID),
		EventType: ReadModelEventNotificationDomainDueRefresh,
		UserID:    userID,
		DomainID:  &domainID,
		NotBefore: notBefore,
	}
	return s.eventDAO.EnqueueTx(db, event)
}

func (s *NotificationReadModelService) EnqueueSummaryInvalidate(userID uint) error {
	if s == nil {
		return nil
	}
	event := &models.ReadModelEvent{
		DedupeKey: fmt.Sprintf("notifications:summary:invalidate:user:%d", userID),
		EventType: ReadModelEventNotificationSummaryInvalidate,
		UserID:    userID,
		NotBefore: time.Now().UTC(),
	}
	return s.eventDAO.Enqueue(event)
}

func (s *NotificationReadModelService) summaryCacheKey(userID uint) string {
	return fmt.Sprintf("notifications:summary:user:%d:v1", userID)
}

func (s *NotificationReadModelService) summaryCacheTag(userID uint) string {
	return fmt.Sprintf("notifications:summary:user:%d", userID)
}

func (s *NotificationReadModelService) invalidateSummaryCache(userID uint) error {
	if s == nil || s.queryCache == nil {
		return nil
	}
	return s.queryCache.InvalidateTag(context.Background(), s.summaryCacheTag(userID))
}

func envDuration(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(raw)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func envInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}
