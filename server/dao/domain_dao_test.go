package dao

import (
	"testing"

	"ankidemy/server/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestDeleteArchivesManagedDomainAndRetainsDetachedAttachment(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(
		&models.Domain{}, &models.ContentBinding{}, &models.ContentEntity{},
		&models.ContentManagedEdge{}, &models.ContentAsset{}, &models.ContentSyncRun{},
	); err != nil {
		t.Fatal(err)
	}

	domain := models.Domain{Name: "Managed notebook", Privacy: "private", OwnerID: 42}
	if err := db.Create(&domain).Error; err != nil {
		t.Fatal(err)
	}
	binding := models.ContentBinding{
		Provider: "org-roam", ProviderNotebookID: "same-notebook", DomainID: domain.ID,
		OwnerID: 42, Config: []byte(`{}`), SchemaVersion: 1, ProtocolVersion: 1,
		AuthorizationState: "attached", ConnectionState: "offline",
	}
	if err := db.Create(&binding).Error; err != nil {
		t.Fatal(err)
	}
	otherDomain := models.Domain{Name: "Current notebook", Privacy: "private", OwnerID: 42}
	if err := db.Create(&otherDomain).Error; err != nil {
		t.Fatal(err)
	}
	otherBinding := models.ContentBinding{
		Provider: "org-roam", ProviderNotebookID: "current-notebook", DomainID: otherDomain.ID,
		OwnerID: 42, Config: []byte(`{}`), SchemaVersion: 1, ProtocolVersion: 1,
		AuthorizationState: "attached", ConnectionState: "online",
	}
	if err := db.Create(&otherBinding).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&models.ContentEntity{
		BindingID: binding.ID, ProviderEntityID: "node-1", Role: "node", NodeType: "definition",
		TableNameValue: "meta_definitions", RowID: 1, State: "active",
		FirstSeenRevision: "r1", LastSeenRevision: "r1",
	}).Error; err != nil {
		t.Fatal(err)
	}

	if err := NewDomainDAO(db).Delete(domain.ID); err != nil {
		t.Fatal(err)
	}
	if err := db.First(&models.Domain{}, domain.ID).Error; err != gorm.ErrRecordNotFound {
		t.Fatalf("archived domain remains active: %v", err)
	}
	if err := db.Unscoped().First(&models.Domain{}, domain.ID).Error; err != nil {
		t.Fatalf("domain was not archived: %v", err)
	}
	var archivedBinding models.ContentBinding
	if err := db.First(&archivedBinding, binding.ID).Error; err != nil {
		t.Fatal(err)
	}
	if archivedBinding.AuthorizationState != "detached" || archivedBinding.ConnectionState != "offline" {
		t.Fatalf("archived binding was not detached: %#v", archivedBinding)
	}
	if err := db.First(&otherBinding, otherBinding.ID).Error; err != nil {
		t.Fatal(err)
	}
	if otherBinding.AuthorizationState != "attached" || otherBinding.ConnectionState != "online" {
		t.Fatalf("archiving another notebook changed the current binding: %#v", otherBinding)
	}
	var entityCount int64
	if err := db.Model(&models.ContentEntity{}).Where("binding_id = ?", binding.ID).Count(&entityCount).Error; err != nil {
		t.Fatal(err)
	}
	if entityCount != 1 {
		t.Fatalf("managed identity map was not retained: entities=%d", entityCount)
	}
}

func TestDeleteContentBindingsForDomainAllowsFreshNotebookImport(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(
		&models.Domain{}, &models.ContentBinding{}, &models.ContentEntity{},
		&models.ContentManagedEdge{}, &models.ContentAsset{}, &models.ContentSyncRun{},
	); err != nil {
		t.Fatal(err)
	}

	oldDomain := models.Domain{Name: "Old import", Privacy: "private", OwnerID: 42}
	if err := db.Create(&oldDomain).Error; err != nil {
		t.Fatal(err)
	}
	oldBinding := models.ContentBinding{
		Provider: "org-roam", ProviderNotebookID: "same-notebook", DomainID: oldDomain.ID,
		OwnerID: 42, Config: []byte(`{}`), SchemaVersion: 1, ProtocolVersion: 1,
		AuthorizationState: "detached", ConnectionState: "offline",
	}
	if err := db.Create(&oldBinding).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Transaction(func(tx *gorm.DB) error {
		return deleteContentBindingsForDomain(tx, oldDomain.ID)
	}); err != nil {
		t.Fatal(err)
	}

	newDomain := models.Domain{Name: "Fresh import", Privacy: "private", OwnerID: 42}
	if err := db.Create(&newDomain).Error; err != nil {
		t.Fatal(err)
	}
	freshBinding := oldBinding
	freshBinding.ID = 0
	freshBinding.DomainID = newDomain.ID
	freshBinding.AuthorizationState = "attached"
	if err := db.Create(&freshBinding).Error; err != nil {
		t.Fatalf("permanently deleted notebook identity blocked a fresh import: %v", err)
	}
}
