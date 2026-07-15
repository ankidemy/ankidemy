package dao

import (
	"log"

	"gorm.io/gorm"
)

// ensureModernSchema migrates existing databases to the standardized SRS
// schema (2026-07 modernization):
//
//   - Canonical node-type strings are 'definition' and 'exercise'
//     everywhere. Rows written with the historical 'meta_definition' /
//     'meta_exercise' spellings are renamed; rows that referenced the old
//     per-version node system are remapped to their pool node where a
//     mapping exists and dropped otherwise.
//   - Legacy per-version SRS tables are dropped.
//   - node_prerequisites.is_manual is dropped (dead flag).
//   - user_meta_exercise_stats.solved_until is backfilled so previously
//     solved exercises expire on the same 90+rand(1..90) day schedule as new
//     solves.
//
// Recurring statements are idempotent.  The prerequisite endpoint rewrite is
// only run while historical meta_* rows still exist: after the first rewrite,
// definition/exercise are canonical pool-level types and must never be treated
// as legacy version-level rows again.
func ensureModernSchema(db *gorm.DB) {
	migrateLegacyPrerequisites(db)

	stmts := []string{
		`ALTER TABLE node_prerequisites DROP COLUMN IF EXISTS is_manual;`,

		// --- other tables carrying node-type strings ----------------------
		`ALTER TABLE domain_node_codes DROP CONSTRAINT IF EXISTS domain_node_codes_node_type_check;`,
		`UPDATE domain_node_codes SET node_type = 'definition' WHERE node_type = 'meta_definition';`,
		`UPDATE domain_node_codes SET node_type = 'exercise' WHERE node_type = 'meta_exercise';`,
		`ALTER TABLE domain_node_codes ADD CONSTRAINT domain_node_codes_node_type_check CHECK (node_type IN ('definition','exercise','source','meta_quest'));`,

		`ALTER TABLE node_relations DROP CONSTRAINT IF EXISTS node_relations_from_type_check;`,
		`ALTER TABLE node_relations DROP CONSTRAINT IF EXISTS node_relations_to_type_check;`,
		`UPDATE node_relations SET from_type = 'definition' WHERE from_type = 'meta_definition';`,
		`UPDATE node_relations SET from_type = 'exercise' WHERE from_type = 'meta_exercise';`,
		`UPDATE node_relations SET to_type = 'definition' WHERE to_type = 'meta_definition';`,
		`UPDATE node_relations SET to_type = 'exercise' WHERE to_type = 'meta_exercise';`,
		`ALTER TABLE node_relations ADD CONSTRAINT node_relations_from_type_check CHECK (from_type IN ('definition','exercise','source','meta_quest'));`,
		`ALTER TABLE node_relations ADD CONSTRAINT node_relations_to_type_check CHECK (to_type IN ('definition','exercise','source','meta_quest'));`,

		`ALTER TABLE node_group_seeds DROP CONSTRAINT IF EXISTS node_group_seeds_node_type_check;`,
		`ALTER TABLE node_group_members DROP CONSTRAINT IF EXISTS node_group_members_node_type_check;`,
		`UPDATE node_group_seeds SET node_type = 'definition' WHERE node_type = 'meta_definition';`,
		`UPDATE node_group_seeds SET node_type = 'exercise' WHERE node_type = 'meta_exercise';`,
		`UPDATE node_group_members SET node_type = 'definition' WHERE node_type = 'meta_definition';`,
		`UPDATE node_group_members SET node_type = 'exercise' WHERE node_type = 'meta_exercise';`,
		`ALTER TABLE node_group_seeds ADD CONSTRAINT node_group_seeds_node_type_check CHECK (node_type IN ('definition','exercise'));`,
		`ALTER TABLE node_group_members ADD CONSTRAINT node_group_members_node_type_check CHECK (node_type IN ('definition','exercise'));`,

		`UPDATE external_prerequisites SET node_type = 'definition' WHERE node_type = 'meta_definition';`,
		`UPDATE external_prerequisites SET node_type = 'exercise' WHERE node_type = 'meta_exercise';`,
		`UPDATE external_prerequisites SET external_node_type = 'definition' WHERE external_node_type = 'meta_definition';`,
		`UPDATE external_prerequisites SET external_node_type = 'exercise' WHERE external_node_type = 'meta_exercise';`,

		// Progress-side tables already use the plain spellings; normalize any
		// strays defensively.
		`UPDATE user_node_progress SET node_type = 'definition' WHERE node_type = 'meta_definition';`,
		`UPDATE user_node_progress SET node_type = 'exercise' WHERE node_type = 'meta_exercise';`,
		`UPDATE review_history SET node_type = 'definition' WHERE node_type = 'meta_definition';`,
		`UPDATE review_history SET node_type = 'exercise' WHERE node_type = 'meta_exercise';`,
		`UPDATE session_reviews SET node_type = 'definition' WHERE node_type = 'meta_definition';`,
		`UPDATE session_reviews SET node_type = 'exercise' WHERE node_type = 'meta_exercise';`,

		// --- drop legacy per-version SRS tables ---------------------------
		`DROP TABLE IF EXISTS session_definitions;`,
		`DROP TABLE IF EXISTS session_exercises;`,
		`DROP TABLE IF EXISTS user_definition_progress;`,
		`DROP TABLE IF EXISTS user_exercise_progress;`,

		// --- solved-state expiry backfill ---------------------------------
		// Existing solves get an expiry as if they were armed at their last
		// update: 90 + rand(1..90) days from updated_at, floored at now+1d so
		// long-idle rows become re-eligible soon but not all on the same day.
		`UPDATE user_meta_exercise_stats
		 SET solved_until = GREATEST(
		   updated_at + make_interval(days => 90 + 1 + floor(random() * 90)::int),
		   NOW() + make_interval(days => 1 + floor(random() * 90)::int)
		 )
		 WHERE solved_until IS NULL;`,
	}

	for _, stmt := range stmts {
		if err := db.Exec(stmt).Error; err != nil {
			log.Printf("Modernization migration note: %v (stmt: %s)", err, stmt)
		}
	}
}

// migrateLegacyPrerequisites performs the destructive, one-way endpoint
// rewrite from the pre-2026 graph vocabulary.  The presence of at least one
// meta_* endpoint is the migration marker used by those databases.  Once all
// endpoints are canonical, this function is a strict no-op; in particular it
// never deletes newly-created canonical prerequisite rows on later startups.
func migrateLegacyPrerequisites(db *gorm.DB) {
	var legacyCount int64
	if err := db.Raw(`SELECT COUNT(*) FROM node_prerequisites
		WHERE node_type IN ('meta_definition','meta_exercise')
		   OR prerequisite_type IN ('meta_definition','meta_exercise')`).
		Scan(&legacyCount).Error; err != nil {
		log.Printf("Modernization migration note: failed to inspect legacy prerequisites: %v", err)
		return
	}
	if legacyCount == 0 {
		return
	}

	stmts := []string{
		// Remap historical version-level endpoints to their pool nodes.  The
		// temporary meta_* spelling keeps them distinguishable until cleanup.
		`UPDATE node_prerequisites np
		 SET prerequisite_id = d.meta_definition_id, prerequisite_type = 'meta_definition'
		 FROM definitions d
		 WHERE np.prerequisite_type = 'definition' AND d.id = np.prerequisite_id
		   AND d.meta_definition_id IS NOT NULL AND d.meta_definition_id <> 0
		   AND NOT EXISTS (
		     SELECT 1 FROM node_prerequisites x
		     WHERE x.node_id = np.node_id AND x.node_type = np.node_type
		       AND x.prerequisite_id = d.meta_definition_id AND x.prerequisite_type = 'meta_definition'
		   );`,
		`UPDATE node_prerequisites np
		 SET prerequisite_id = e.meta_exercise_id, prerequisite_type = 'meta_exercise'
		 FROM exercises e
		 WHERE np.prerequisite_type = 'exercise' AND e.id = np.prerequisite_id
		   AND e.meta_exercise_id IS NOT NULL AND e.meta_exercise_id <> 0
		   AND NOT EXISTS (
		     SELECT 1 FROM node_prerequisites x
		     WHERE x.node_id = np.node_id AND x.node_type = np.node_type
		       AND x.prerequisite_id = e.meta_exercise_id AND x.prerequisite_type = 'meta_exercise'
		   );`,
		`UPDATE node_prerequisites np
		 SET node_id = d.meta_definition_id, node_type = 'meta_definition'
		 FROM definitions d
		 WHERE np.node_type = 'definition' AND d.id = np.node_id
		   AND d.meta_definition_id IS NOT NULL AND d.meta_definition_id <> 0
		   AND NOT EXISTS (
		     SELECT 1 FROM node_prerequisites x
		     WHERE x.prerequisite_id = np.prerequisite_id AND x.prerequisite_type = np.prerequisite_type
		       AND x.node_id = d.meta_definition_id AND x.node_type = 'meta_definition'
		   );`,
		`UPDATE node_prerequisites np
		 SET node_id = e.meta_exercise_id, node_type = 'meta_exercise'
		 FROM exercises e
		 WHERE np.node_type = 'exercise' AND e.id = np.node_id
		   AND e.meta_exercise_id IS NOT NULL AND e.meta_exercise_id <> 0
		   AND NOT EXISTS (
		     SELECT 1 FROM node_prerequisites x
		     WHERE x.prerequisite_id = np.prerequisite_id AND x.prerequisite_type = np.prerequisite_type
		       AND x.node_id = e.meta_exercise_id AND x.node_type = 'meta_exercise'
		   );`,
		// Plain endpoints left after the remap are version-level rows that do
		// not have a pool mapping and cannot be represented by the modern graph.
		`DELETE FROM node_prerequisites
		 WHERE node_type IN ('definition','exercise') OR prerequisite_type IN ('definition','exercise');`,
		`ALTER TABLE node_prerequisites DROP CONSTRAINT IF EXISTS node_prerequisites_node_type_check;`,
		`ALTER TABLE node_prerequisites DROP CONSTRAINT IF EXISTS node_prerequisites_prerequisite_type_check;`,
		`UPDATE node_prerequisites SET node_type = 'definition' WHERE node_type = 'meta_definition';`,
		`UPDATE node_prerequisites SET node_type = 'exercise' WHERE node_type = 'meta_exercise';`,
		`UPDATE node_prerequisites SET prerequisite_type = 'definition' WHERE prerequisite_type = 'meta_definition';`,
		`UPDATE node_prerequisites SET prerequisite_type = 'exercise' WHERE prerequisite_type = 'meta_exercise';`,
	}

	if err := db.Transaction(func(tx *gorm.DB) error {
		for _, stmt := range stmts {
			if err := tx.Exec(stmt).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		log.Printf("Modernization migration note: legacy prerequisite rewrite failed: %v", err)
	}
}
