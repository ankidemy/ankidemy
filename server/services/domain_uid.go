package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

// GenerateDomainUID builds a stable UID for domain linking.
func GenerateDomainUID(userID, sourceDomainID uint) (string, error) {
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return fmt.Sprintf("%d-%d-%s", userID, sourceDomainID, hex.EncodeToString(buf)), nil
}
