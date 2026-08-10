package middleware

import "testing"

func TestGetJWTSecretRequiresProductionSecret(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", "")

	defer func() {
		if recover() == nil {
			t.Fatal("expected missing production JWT_SECRET to panic")
		}
	}()

	getJWTSecret()
}

func TestGetJWTSecretAllowsDevelopmentFallback(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("JWT_SECRET", "")

	if secret := getJWTSecret(); secret != "your-default-jwt-secret-for-dev" {
		t.Fatalf("unexpected development fallback %q", secret)
	}
}

func TestJWTSecretReadsCurrentEnvironment(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", "rotated-test-secret")

	if secret := string(JWTSecret()); secret != "rotated-test-secret" {
		t.Fatalf("unexpected signing secret %q", secret)
	}
}
