package dao

import (
	"errors"
	"myapp/server/models"

	"gorm.io/gorm"
)

// DomainDAO handles database operations for domains
type DomainDAO struct {
	db *gorm.DB
}

// NewDomainDAO creates a new DomainDAO instance
func NewDomainDAO(db *gorm.DB) *DomainDAO {
	return &DomainDAO{db: db}
}

// DomainWithStats represents a domain with its current statistics
type DomainWithStats struct {
	models.Domain
	NodeCount     int `json:"nodeCount"`
	ExerciseCount int `json:"exerciseCount"`
}

// DomainStats represents domain statistics
type DomainStats struct {
	DomainID      uint `json:"domainId"`
	NodeCount     int  `json:"nodeCount"`
	ExerciseCount int  `json:"exerciseCount"`
}

// Create creates a new domain
func (d *DomainDAO) Create(domain *models.Domain) error {
	return d.db.Create(domain).Error
}

// Update updates an existing domain
func (d *DomainDAO) Update(domain *models.Domain) error {
	return d.db.Save(domain).Error
}

// Delete deletes a domain by ID
func (d *DomainDAO) Delete(id uint) error {
	return d.db.Delete(&models.Domain{}, id).Error
}

// FindByID finds a domain by ID
func (d *DomainDAO) FindByID(id uint) (*models.Domain, error) {
	var domain models.Domain
	result := d.db.First(&domain, id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("domain not found")
		}
		return nil, result.Error
	}
	return &domain, nil
}

// FindByIDWithStats finds a domain by ID and includes current statistics
func (d *DomainDAO) FindByIDWithStats(id uint) (*DomainWithStats, error) {
	var domain models.Domain
	result := d.db.First(&domain, id)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("domain not found")
		}
		return nil, result.Error
	}

	stats, err := d.GetDomainStats(id)
	if err != nil {
		return nil, err
	}

	return &DomainWithStats{
		Domain:        domain,
		NodeCount:     stats.NodeCount,
		ExerciseCount: stats.ExerciseCount,
	}, nil
}

// GetDomainStats gets real-time statistics for a domain
func (d *DomainDAO) GetDomainStats(domainID uint) (*DomainStats, error) {
	var stats DomainStats
	stats.DomainID = domainID

	// Count definitions
	var definitionCount int64
	if err := d.db.Model(&models.Definition{}).Where("domain_id = ?", domainID).Count(&definitionCount).Error; err != nil {
		return nil, err
	}
	stats.NodeCount = int(definitionCount)

	// Count exercises
	var exerciseCount int64
	if err := d.db.Model(&models.Exercise{}).Where("domain_id = ?", domainID).Count(&exerciseCount).Error; err != nil {
		return nil, err
	}
	stats.ExerciseCount = int(exerciseCount)

	return &stats, nil
}

// FindByName finds a domain by name
func (d *DomainDAO) FindByName(name string) (*models.Domain, error) {
	var domain models.Domain
	result := d.db.Where("name = ?", name).First(&domain)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("domain not found")
		}
		return nil, result.Error
	}
	return &domain, nil
}

// GetAll returns all domains
func (d *DomainDAO) GetAll() ([]models.Domain, error) {
	var domains []models.Domain
	result := d.db.Find(&domains)
	return domains, result.Error
}

// GetByOwnerID returns all domains owned by a specific user
func (d *DomainDAO) GetByOwnerID(ownerID uint) ([]models.Domain, error) {
	var domains []models.Domain
	result := d.db.Where("owner_id = ?", ownerID).Find(&domains)
	return domains, result.Error
}

// GetByOwnerIDWithStats returns all domains owned by a specific user with statistics
func (d *DomainDAO) GetByOwnerIDWithStats(ownerID uint) ([]DomainWithStats, error) {
	var domains []models.Domain
	if err := d.db.Where("owner_id = ?", ownerID).Find(&domains).Error; err != nil {
		return nil, err
	}
	return d.domainsToDomainsWithStats(domains)
}

// GetPublicDomains returns all public domains
func (d *DomainDAO) GetPublicDomains() ([]models.Domain, error) {
	var domains []models.Domain
	result := d.db.Where("privacy = ?", "public").Find(&domains)
	return domains, result.Error
}

// GetPublicDomainsWithStats returns all public domains with statistics
func (d *DomainDAO) GetPublicDomainsWithStats() ([]DomainWithStats, error) {
	var domains []models.Domain
	if err := d.db.Where("privacy = ?", "public").Find(&domains).Error; err != nil {
		return nil, err
	}
	return d.domainsToDomainsWithStats(domains)
}

// GetDomainsWithFullDetails returns domains with their definitions and exercises
func (d *DomainDAO) GetDomainsWithFullDetails(domainID uint) (*models.Domain, error) {
	var domain models.Domain
	result := d.db.
		Preload("Definitions").
		Preload("Definitions.References").
		Preload("Definitions.Prerequisites").
		Preload("Exercises").
		Preload("Exercises.Prerequisites").
		First(&domain, domainID)
	
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("domain not found")
		}
		return nil, result.Error
	}
	
	return &domain, nil
}

// AddComment adds a comment to a domain
func (d *DomainDAO) AddComment(comment *models.DomainComment) error {
	return d.db.Create(comment).Error
}

// GetComments returns all comments for a domain
func (d *DomainDAO) GetComments(domainID uint) ([]models.DomainComment, error) {
	var comments []models.DomainComment
	result := d.db.Where("domain_id = ?", domainID).Find(&comments)
	return comments, result.Error
}

// DeleteComment deletes a comment by ID
func (d *DomainDAO) DeleteComment(commentID uint, userID uint) error {
	// Only allow deletion if user is the comment author or an admin
	result := d.db.Where("id = ? AND user_id = ?", commentID, userID).Delete(&models.DomainComment{})
	if result.RowsAffected == 0 {
		// Check if user is admin
		var user models.User
		if err := d.db.First(&user, userID).Error; err != nil {
			return err
		}
		
		if user.IsAdmin {
			return d.db.Delete(&models.DomainComment{}, commentID).Error
		}
		
		return errors.New("unauthorized to delete this comment")
	}
	
	return result.Error
}

// GetByIDs returns domains with the given IDs
func (d *DomainDAO) GetByIDs(ids []uint) ([]models.Domain, error) {
    var domains []models.Domain
    if len(ids) == 0 {
        return domains, nil
    }
    result := d.db.Where("id IN ?", ids).Find(&domains)
    return domains, result.Error
}

// GetByIDsWithStats returns domains with the given IDs, including stats
func (d *DomainDAO) GetByIDsWithStats(ids []uint) ([]DomainWithStats, error) {
    if len(ids) == 0 {
        return []DomainWithStats{}, nil
    }

    var domains []models.Domain
    if err := d.db.Where("id IN ?", ids).Find(&domains).Error; err != nil {
        return nil, err
    }

    return d.domainsToDomainsWithStats(domains)
}


// domainsToDomainsWithStats is a helper to convert a slice of domains to a slice with stats
func (d *DomainDAO) domainsToDomainsWithStats(domains []models.Domain) ([]DomainWithStats, error) {
    var domainsWithStats []DomainWithStats
    for _, domain := range domains {
        stats, err := d.GetDomainStats(domain.ID)
        if err != nil {
            // If we can't get stats, include the domain with zero counts and continue
            domainsWithStats = append(domainsWithStats, DomainWithStats{
                Domain:        domain,
                NodeCount:     0,
                ExerciseCount: 0,
            })
            continue
        }

        domainsWithStats = append(domainsWithStats, DomainWithStats{
            Domain:        domain,
            NodeCount:     stats.NodeCount,
            ExerciseCount: stats.ExerciseCount,
        })
    }
    return domainsWithStats, nil
}
