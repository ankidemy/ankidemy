// DEPRECATED: This file has been deprecated and replaced by services/import_service.go
// 
// The functionality previously in this file has been moved to a proper service architecture:
// - services/import_service.go: Contains all import/export logic
// - handlers/domain_handler.go: Updated to support import functionality
// - main.go: Now uses ImportService instead of direct import logic
//
// Tutorial import is now handled by ImportService.ImportTutorialIfNotExists()
// Domain import/export is handled by ImportService methods
//
// This file is kept temporarily for reference but should not be used.
// It will be removed in a future version.

package main

import (
	"log"
)

// DEPRECATED: Use services.ImportService.ImportTutorialIfNotExists() instead
func autoImportTutorial(db interface{}) error {
	log.Println("WARNING: autoImportTutorial is deprecated. Use services.ImportService.ImportTutorialIfNotExists() instead")
	return nil
}

// DEPRECATED: Use services.ImportService methods instead
func readTutorialFile() (interface{}, error) {
	log.Println("WARNING: readTutorialFile is deprecated. Use services.ImportService.ReadImportFileFromPath() instead")
	return nil, nil
}

// DEPRECATED: Use services.ImportService methods instead
func importTutorialContent(db, domain, owner, data interface{}) error {
	log.Println("WARNING: importTutorialContent is deprecated. Use services.ImportService.CreateDomainWithImport() instead")
	return nil
}

// DEPRECATED: Use services.ImportService methods instead
func createTutorialFile() error {
	log.Println("WARNING: createTutorialFile is deprecated. Tutorial files should be managed through ImportService")
	return nil
}
