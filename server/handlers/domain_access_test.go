package handlers

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"ankidemy/server/models"
	"github.com/gin-gonic/gin"
)

type fakeDomainFinder struct {
	domain *models.Domain
	err    error
}

func (f fakeDomainFinder) FindByID(id uint) (*models.Domain, error) {
	if f.err != nil {
		return nil, f.err
	}
	if f.domain == nil {
		return nil, errors.New("domain not found")
	}
	return f.domain, nil
}

type fakePermissionLookup struct {
	role   string
	exists bool
	err    error
}

func (f fakePermissionLookup) GetRole(domainID, userID uint) (string, bool, error) {
	return f.role, f.exists, f.err
}

func testContextWithParam(param, value string) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Params = gin.Params{{Key: param, Value: value}}
	return c, recorder
}

func TestRequireDomainViewAccessLoadsContext(t *testing.T) {
	gin.SetMode(gin.TestMode)

	c, recorder := testContextWithParam("id", "42")
	c.Set("userID", uint(7))

	access, ok := requireDomainViewAccess(c, fakeDomainFinder{
		domain: &models.Domain{ID: 42, OwnerID: 10, Privacy: "public"},
	}, fakePermissionLookup{}, "id")
	if !ok {
		t.Fatalf("expected access to be granted, got status %d", recorder.Code)
	}
	if access.Domain.ID != 42 {
		t.Fatalf("expected domain 42, got %d", access.Domain.ID)
	}
	if access.UserID != 7 {
		t.Fatalf("expected user 7, got %d", access.UserID)
	}
	if access.IsAdmin {
		t.Fatal("expected non-admin context")
	}
}

func TestRequireDomainEditAccessRejectsViewer(t *testing.T) {
	gin.SetMode(gin.TestMode)

	c, recorder := testContextWithParam("id", "42")
	c.Set("userID", uint(7))

	_, ok := requireDomainEditAccess(c, fakeDomainFinder{
		domain: &models.Domain{ID: 42, OwnerID: 10, Privacy: "private"},
	}, fakePermissionLookup{
		role:   "viewer",
		exists: true,
	}, "id")
	if ok {
		t.Fatal("expected access to be denied")
	}
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
}

func TestRequireDomainAccessRejectsInvalidDomainParam(t *testing.T) {
	gin.SetMode(gin.TestMode)

	c, recorder := testContextWithParam("id", "not-a-number")
	c.Set("userID", uint(7))

	_, ok := requireDomainViewAccess(c, fakeDomainFinder{}, fakePermissionLookup{}, "id")
	if ok {
		t.Fatal("expected invalid domain param to fail")
	}
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", recorder.Code)
	}
}

func TestResolveNodeAccessWithLookupSupportsConfiguredNodeTypes(t *testing.T) {
	tests := []struct {
		nodeType   string
		nodeID     uint
		domainID   uint
		ownerID    uint
		visibility string
	}{
		{nodeType: "definition", nodeID: 1, domainID: 11, ownerID: 21},
		{nodeType: "exercise", nodeID: 2, domainID: 12, ownerID: 22},
		{nodeType: "meta_definition", nodeID: 3, domainID: 13, ownerID: 23},
		{nodeType: "meta_exercise", nodeID: 4, domainID: 14, ownerID: 24},
		{nodeType: "source", nodeID: 5, domainID: 15, ownerID: 25, visibility: "private"},
		{nodeType: "quest", nodeID: 6, domainID: 16, ownerID: 26, visibility: "domain"},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.nodeType, func(t *testing.T) {
			resolved, err := resolveNodeAccessWithLookup(tc.nodeType, tc.nodeID, map[string]nodeAccessLookup{
				tc.nodeType: func(nodeID uint) (*resolvedNodeAccess, error) {
					if nodeID != tc.nodeID {
						t.Fatalf("expected node ID %d, got %d", tc.nodeID, nodeID)
					}
					return &resolvedNodeAccess{
						DomainID:   tc.domainID,
						OwnerID:    tc.ownerID,
						Visibility: tc.visibility,
					}, nil
				},
			})
			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if resolved.NodeType != tc.nodeType {
				t.Fatalf("expected node type %q, got %q", tc.nodeType, resolved.NodeType)
			}
			if resolved.NodeID != tc.nodeID {
				t.Fatalf("expected node ID %d, got %d", tc.nodeID, resolved.NodeID)
			}
			if resolved.DomainID != tc.domainID {
				t.Fatalf("expected domain ID %d, got %d", tc.domainID, resolved.DomainID)
			}
			if resolved.OwnerID != tc.ownerID {
				t.Fatalf("expected owner ID %d, got %d", tc.ownerID, resolved.OwnerID)
			}
			if resolved.Visibility != tc.visibility {
				t.Fatalf("expected visibility %q, got %q", tc.visibility, resolved.Visibility)
			}
		})
	}
}

func TestResolveNodeAccessWithLookupRejectsUnsupportedType(t *testing.T) {
	_, err := resolveNodeAccessWithLookup("unknown", 99, map[string]nodeAccessLookup{})
	if err == nil {
		t.Fatal("expected unsupported node type error")
	}
}

func TestCanMutateVisibilityScopedNode(t *testing.T) {
	domain := &models.Domain{ID: 7, OwnerID: 50, Privacy: "private"}

	tests := []struct {
		name        string
		node        *resolvedNodeAccess
		userID      uint
		isAdmin     bool
		permission  fakePermissionLookup
		wantAllowed bool
		expectErr   bool
	}{
		{
			name:        "private owner",
			node:        &resolvedNodeAccess{OwnerID: 5, Visibility: "private"},
			userID:      5,
			wantAllowed: true,
		},
		{
			name:        "private outsider",
			node:        &resolvedNodeAccess{OwnerID: 5, Visibility: "private"},
			userID:      9,
			wantAllowed: false,
		},
		{
			name:        "domain editor",
			node:        &resolvedNodeAccess{OwnerID: 5, Visibility: "domain"},
			userID:      9,
			permission:  fakePermissionLookup{role: "editor", exists: true},
			wantAllowed: true,
		},
		{
			name:        "domain viewer",
			node:        &resolvedNodeAccess{OwnerID: 5, Visibility: "domain"},
			userID:      9,
			permission:  fakePermissionLookup{role: "viewer", exists: true},
			wantAllowed: false,
		},
		{
			name:        "admin bypass",
			node:        &resolvedNodeAccess{OwnerID: 5, Visibility: "domain"},
			userID:      99,
			isAdmin:     true,
			wantAllowed: true,
		},
		{
			name:      "invalid visibility",
			node:      &resolvedNodeAccess{OwnerID: 5, Visibility: "public"},
			userID:    5,
			expectErr: true,
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			allowed, err := canMutateVisibilityScopedNode(domain, tc.node, tc.userID, tc.isAdmin, tc.permission)
			if tc.expectErr {
				if err == nil {
					t.Fatal("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
			if allowed != tc.wantAllowed {
				t.Fatalf("expected allowed=%t, got %t", tc.wantAllowed, allowed)
			}
		})
	}
}
