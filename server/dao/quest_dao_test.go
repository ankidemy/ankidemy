package dao

import (
	"testing"
	"time"

	"ankidemy/server/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestEnsureUserStateIsIdempotentAndPreservesExistingState(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.UserQuestState{}); err != nil {
		t.Fatal(err)
	}

	dao := NewQuestDAO(db)
	created, err := dao.EnsureUserState(7, 11)
	if err != nil {
		t.Fatalf("create state: %v", err)
	}
	if created.ID == 0 || !created.Active {
		t.Fatalf("unexpected created state: %+v", created)
	}

	nextDue := time.Date(2026, 7, 21, 9, 30, 0, 0, time.UTC)
	created.Active = false
	created.NextDueAt = &nextDue
	if err := dao.UpdateUserState(created); err != nil {
		t.Fatalf("update state: %v", err)
	}

	existing, err := dao.EnsureUserState(7, 11)
	if err != nil {
		t.Fatalf("ensure existing state: %v", err)
	}
	if existing.ID != created.ID {
		t.Fatalf("created duplicate state: got id %d, want %d", existing.ID, created.ID)
	}
	if existing.Active {
		t.Fatal("ensure reset an existing inactive state")
	}
	if existing.NextDueAt == nil || !existing.NextDueAt.Equal(nextDue) {
		t.Fatalf("ensure changed next due: got %v, want %v", existing.NextDueAt, nextDue)
	}

	var count int64
	if err := db.Model(&models.UserQuestState{}).
		Where("user_id = ? AND quest_id = ?", 7, 11).
		Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("got %d state rows, want 1", count)
	}
}
