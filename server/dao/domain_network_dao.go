package dao

import (
    "errors"
    "ankidemy/server/models"
    "gorm.io/gorm"
)

// DomainNetworkDAO encapsulates CRUD for DomainLink
type DomainNetworkDAO struct {
    db *gorm.DB
}

func NewDomainNetworkDAO(db *gorm.DB) *DomainNetworkDAO {
    return &DomainNetworkDAO{db: db}
}

func (d *DomainNetworkDAO) DB() *gorm.DB { return d.db }

// GetLinks returns links created by a specific user; optionally filtered by domain IDs
func (d *DomainNetworkDAO) GetLinks(userID uint, domainIDs []uint) ([]models.DomainLink, error) {
    var links []models.DomainLink
    q := d.db.Model(&models.DomainLink{}).Where("created_by = ?", userID)
    if len(domainIDs) > 0 {
        // Include links where either endpoint is in the provided set
        q = q.Where("domain_a_id IN ? OR domain_b_id IN ?", domainIDs, domainIDs)
    }
    if err := q.Order("created_at DESC").Find(&links).Error; err != nil {
        return nil, err
    }
    return links, nil
}

// CreateLink creates a link; pair is normalized so A < B and deduplicated per user
func (d *DomainNetworkDAO) CreateLink(userID, domain1, domain2 uint) (*models.DomainLink, error) {
    if domain1 == domain2 {
        return nil, errors.New("cannot link a domain to itself")
    }
    a, b := domain1, domain2
    if a > b {
        a, b = b, a
    }
    link := &models.DomainLink{DomainAID: a, DomainBID: b, CreatedBy: userID}
    // Upsert-like behavior: if exists, return existing
    var existing models.DomainLink
    err := d.db.Where("created_by = ? AND domain_a_id = ? AND domain_b_id = ?", userID, a, b).First(&existing).Error
    if err == nil {
        return &existing, nil
    }
    if errors.Is(err, gorm.ErrRecordNotFound) {
        if err := d.db.Create(link).Error; err != nil {
            return nil, err
        }
        return link, nil
    }
    return nil, err
}

// DeleteLink removes a link by ID ensuring ownership by user
func (d *DomainNetworkDAO) DeleteLink(userID, linkID uint) error {
    res := d.db.Where("id = ? AND created_by = ?", linkID, userID).Delete(&models.DomainLink{})
    if res.Error != nil {
        return res.Error
    }
    if res.RowsAffected == 0 {
        return gorm.ErrRecordNotFound
    }
    return nil
}

