package dao

import (
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"ankidemy/server/models"
)

type NotificationDomain struct {
	DomainID   uint
	DomainName string
}

type dueCountRow struct {
	DomainID uint
	DueCount int
}

// UserDomainDueProjectionDAO manages the due-count read model.
type UserDomainDueProjectionDAO struct {
	db *gorm.DB
}

func NewUserDomainDueProjectionDAO(db *gorm.DB) *UserDomainDueProjectionDAO {
	return &UserDomainDueProjectionDAO{db: db}
}

// ListNotificationDomains returns the same domain universe currently used by
// notification polling: owned domains + enrolled domains not owned by user.
func (d *UserDomainDueProjectionDAO) ListNotificationDomains(userID uint) ([]NotificationDomain, error) {
	query := `
		SELECT DISTINCT domain_id, domain_name
		FROM (
			SELECT d.id AS domain_id, d.name AS domain_name
			FROM domains d
			WHERE d.owner_id = ? AND d.deleted_at IS NULL
			UNION ALL
			SELECT d.id AS domain_id, d.name AS domain_name
			FROM domains d
			JOIN user_domain_progress udp ON udp.domain_id = d.id
			WHERE udp.user_id = ? AND d.owner_id <> ? AND d.deleted_at IS NULL
		) domains_for_notifications
		ORDER BY domain_id ASC
	`
	var rows []NotificationDomain
	if err := d.db.Raw(query, userID, userID, userID).Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (d *UserDomainDueProjectionDAO) GetByUserAndDomainIDs(userID uint, domainIDs []uint) (map[uint]models.UserDomainDueProjection, error) {
	result := make(map[uint]models.UserDomainDueProjection, len(domainIDs))
	if len(domainIDs) == 0 {
		return result, nil
	}

	var rows []models.UserDomainDueProjection
	if err := d.db.Where("user_id = ? AND domain_id IN ?", userID, domainIDs).Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.DomainID] = row
	}
	return result, nil
}

func (d *UserDomainDueProjectionDAO) UpsertDueCount(userID uint, domainID uint, dueCount int, computedAt time.Time) error {
	entry := models.UserDomainDueProjection{
		UserID:     userID,
		DomainID:   domainID,
		DueReviews: dueCount,
		ComputedAt: computedAt.UTC(),
	}
	return d.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "domain_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"due_reviews", "computed_at", "updated_at"}),
	}).Create(&entry).Error
}

func (d *UserDomainDueProjectionDAO) UpsertDueCounts(userID uint, dueByDomain map[uint]int, computedAt time.Time) error {
	if len(dueByDomain) == 0 {
		return nil
	}
	rows := make([]models.UserDomainDueProjection, 0, len(dueByDomain))
	stamp := computedAt.UTC()
	for domainID, dueCount := range dueByDomain {
		rows = append(rows, models.UserDomainDueProjection{
			UserID:     userID,
			DomainID:   domainID,
			DueReviews: dueCount,
			ComputedAt: stamp,
		})
	}
	return d.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "domain_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"due_reviews", "computed_at", "updated_at"}),
	}).Create(&rows).Error
}

func (d *UserDomainDueProjectionDAO) ComputeDueCount(userID uint, domainID uint) (int, error) {
	counts, err := d.ComputeDueCounts(userID, []uint{domainID})
	if err != nil {
		return 0, err
	}
	return counts[domainID], nil
}

// ComputeDueCounts computes due reviews in one grouped query for a domain set.
func (d *UserDomainDueProjectionDAO) ComputeDueCounts(userID uint, domainIDs []uint) (map[uint]int, error) {
	result := make(map[uint]int, len(domainIDs))
	if len(domainIDs) == 0 {
		return result, nil
	}

	query := `
		SELECT domain_id, COUNT(*)::int AS due_count
		FROM (
			SELECT md.domain_id
			FROM meta_definitions md
			JOIN user_node_progress unp ON md.id = unp.node_id
				AND unp.node_type = 'definition' AND unp.user_id = ?
			WHERE md.domain_id IN ? AND unp.status = 'grasped'
				AND (unp.next_review IS NULL OR unp.next_review <= NOW())
			UNION ALL
			SELECT me.domain_id
			FROM meta_exercises me
			JOIN user_node_progress unp ON me.id = unp.node_id
				AND unp.node_type = 'exercise' AND unp.user_id = ?
			WHERE me.domain_id IN ? AND unp.status = 'grasped'
				AND (unp.next_review IS NULL OR unp.next_review <= NOW())
		) due_nodes
		GROUP BY domain_id
	`

	var rows []dueCountRow
	if err := d.db.Raw(query, userID, domainIDs, userID, domainIDs).Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.DomainID] = row.DueCount
	}

	for _, domainID := range domainIDs {
		if _, exists := result[domainID]; !exists {
			result[domainID] = 0
		}
	}

	return result, nil
}
