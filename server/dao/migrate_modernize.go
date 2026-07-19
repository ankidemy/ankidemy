package dao

import (
	"fmt"
	"log"

	"gorm.io/gorm"
)

// migrateQuestNomenclature upgrades the last pre-modern quest vocabulary in
// place. PostgreSQL carries foreign-key targets across table/column renames, so
// quest IDs, versions, events, and per-user state retain their identity.
func migrateQuestNomenclature(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		statements := []string{
			// A previous partial migration must never leave two authoritative
			// tables/columns. Refuse to guess which copy owns the data.
			`DO $$ BEGIN
				IF to_regclass('public.meta_quests') IS NOT NULL AND to_regclass('public.quests') IS NOT NULL THEN
					RAISE EXCEPTION 'both legacy meta_quests and canonical quests tables exist';
				END IF;
				IF to_regclass('public.user_meta_quest_state') IS NOT NULL AND to_regclass('public.user_quest_state') IS NOT NULL THEN
					RAISE EXCEPTION 'both legacy user_meta_quest_state and canonical user_quest_state tables exist';
				END IF;
			END $$`,
			`DO $$ BEGIN
				IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quest_versions' AND column_name='meta_quest_id')
				   AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quest_versions' AND column_name='quest_id') THEN
					RAISE EXCEPTION 'both legacy and canonical quest ID columns exist on quest_versions';
				END IF;
				IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_quest_state' AND column_name='meta_quest_id')
				   AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_quest_state' AND column_name='quest_id') THEN
					RAISE EXCEPTION 'both legacy and canonical quest ID columns exist on user_quest_state';
				END IF;
				IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quest_events' AND column_name='meta_quest_id')
				   AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quest_events' AND column_name='quest_id') THEN
					RAISE EXCEPTION 'both legacy and canonical quest ID columns exist on quest_events';
				END IF;
			END $$`,
			`ALTER TABLE IF EXISTS domain_node_codes DROP CONSTRAINT IF EXISTS domain_node_codes_node_type_check`,
			`ALTER TABLE IF EXISTS node_relations DROP CONSTRAINT IF EXISTS node_relations_from_type_check`,
			`ALTER TABLE IF EXISTS node_relations DROP CONSTRAINT IF EXISTS node_relations_to_type_check`,
			`DO $$ BEGIN
				IF to_regclass('public.meta_quests') IS NOT NULL AND to_regclass('public.quests') IS NULL THEN
					ALTER TABLE meta_quests RENAME TO quests;
				END IF;
			END $$`,
			`DO $$ BEGIN
				IF to_regclass('public.user_meta_quest_state') IS NOT NULL AND to_regclass('public.user_quest_state') IS NULL THEN
					ALTER TABLE user_meta_quest_state RENAME TO user_quest_state;
				END IF;
			END $$`,
			`DO $$ BEGIN
				IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quest_versions' AND column_name='meta_quest_id')
				   AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quest_versions' AND column_name='quest_id') THEN
					ALTER TABLE quest_versions RENAME COLUMN meta_quest_id TO quest_id;
				END IF;
			END $$`,
			`DO $$ BEGIN
				IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_quest_state' AND column_name='meta_quest_id')
				   AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_quest_state' AND column_name='quest_id') THEN
					ALTER TABLE user_quest_state RENAME COLUMN meta_quest_id TO quest_id;
				END IF;
			END $$`,
			`DO $$ BEGIN
				IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quest_events' AND column_name='meta_quest_id')
				   AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quest_events' AND column_name='quest_id') THEN
					ALTER TABLE quest_events RENAME COLUMN meta_quest_id TO quest_id;
				END IF;
			END $$`,
			`DO $$ BEGIN
				IF to_regclass('public.quest_versions') IS NOT NULL
				   AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quest_versions' AND column_name='display_order') THEN
					ALTER TABLE quest_versions ADD COLUMN display_order integer;
					WITH ranked AS (
						SELECT id, row_number() OVER (PARTITION BY quest_id ORDER BY id) - 1 AS position
						FROM quest_versions
					)
					UPDATE quest_versions qv SET display_order = ranked.position FROM ranked WHERE qv.id = ranked.id;
					ALTER TABLE quest_versions ALTER COLUMN display_order SET DEFAULT 0;
					ALTER TABLE quest_versions ALTER COLUMN display_order SET NOT NULL;
				END IF;
			END $$`,
			`DO $$ BEGIN IF to_regclass('public.domain_node_codes') IS NOT NULL THEN UPDATE domain_node_codes SET node_type = 'quest' WHERE node_type = 'meta_quest'; END IF; END $$`,
			`DO $$ BEGIN IF to_regclass('public.node_relations') IS NOT NULL THEN UPDATE node_relations SET from_type = 'quest' WHERE from_type = 'meta_quest'; UPDATE node_relations SET to_type = 'quest' WHERE to_type = 'meta_quest'; END IF; END $$`,
			`DO $$ BEGIN IF to_regclass('public.external_node_relations') IS NOT NULL THEN UPDATE external_node_relations SET local_node_type = 'quest' WHERE local_node_type = 'meta_quest'; UPDATE external_node_relations SET external_node_type = 'quest' WHERE external_node_type = 'meta_quest'; END IF; END $$`,

			// Constraint and index names are schema API too; remove the obsolete
			// vocabulary rather than leaving cosmetic legacy behind after renames.
			`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meta_quests_pkey') THEN ALTER TABLE quests RENAME CONSTRAINT meta_quests_pkey TO quests_pkey; END IF; END $$`,
			`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meta_quests_domain_id_fkey') THEN ALTER TABLE quests RENAME CONSTRAINT meta_quests_domain_id_fkey TO quests_domain_id_fkey; END IF; END $$`,
			`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meta_quests_owner_id_fkey') THEN ALTER TABLE quests RENAME CONSTRAINT meta_quests_owner_id_fkey TO quests_owner_id_fkey; END IF; END $$`,
			`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meta_quests_kind_check') THEN ALTER TABLE quests RENAME CONSTRAINT meta_quests_kind_check TO quests_kind_check; END IF; END $$`,
			`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='meta_quests_visibility_check') THEN ALTER TABLE quests RENAME CONSTRAINT meta_quests_visibility_check TO quests_visibility_check; END IF; END $$`,
			`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quest_versions_meta_quest_id_fkey') THEN ALTER TABLE quest_versions RENAME CONSTRAINT quest_versions_meta_quest_id_fkey TO quest_versions_quest_id_fkey; END IF; END $$`,
			`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_meta_quest_state_pkey') THEN ALTER TABLE user_quest_state RENAME CONSTRAINT user_meta_quest_state_pkey TO user_quest_state_pkey; END IF; END $$`,
			`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_meta_quest_state_user_id_fkey') THEN ALTER TABLE user_quest_state RENAME CONSTRAINT user_meta_quest_state_user_id_fkey TO user_quest_state_user_id_fkey; END IF; END $$`,
			`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_meta_quest_state_meta_quest_id_fkey') THEN ALTER TABLE user_quest_state RENAME CONSTRAINT user_meta_quest_state_meta_quest_id_fkey TO user_quest_state_quest_id_fkey; END IF; END $$`,
			`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_meta_quest_state_user_id_meta_quest_id_key') THEN ALTER TABLE user_quest_state RENAME CONSTRAINT user_meta_quest_state_user_id_meta_quest_id_key TO user_quest_state_user_id_quest_id_key; END IF; END $$`,
			`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quest_events_meta_quest_id_fkey') THEN ALTER TABLE quest_events RENAME CONSTRAINT quest_events_meta_quest_id_fkey TO quest_events_quest_id_fkey; END IF; END $$`,
			`ALTER INDEX IF EXISTS idx_meta_quests_code RENAME TO idx_quests_code`,
			`ALTER INDEX IF EXISTS idx_meta_quests_deleted_at RENAME TO idx_quests_deleted_at`,
			`ALTER INDEX IF EXISTS idx_meta_quests_domain_code RENAME TO idx_quests_domain_code`,
			`ALTER INDEX IF EXISTS idx_meta_quests_domain_id RENAME TO idx_quests_domain_id`,
			`ALTER INDEX IF EXISTS idx_meta_quests_owner_id RENAME TO idx_quests_owner_id`,
			`ALTER INDEX IF EXISTS idx_quest_versions_meta_quest_id RENAME TO idx_quest_versions_quest_id`,
			`DO $$ BEGIN IF to_regclass('public.quest_versions') IS NOT NULL THEN CREATE INDEX IF NOT EXISTS idx_quest_versions_order ON quest_versions (quest_id, display_order, id); END IF; END $$`,
			`ALTER INDEX IF EXISTS idx_user_meta_quest RENAME TO idx_user_quest`,
			`ALTER INDEX IF EXISTS idx_user_meta_quest_state_meta RENAME TO idx_user_quest_state_quest`,
			`ALTER INDEX IF EXISTS idx_user_meta_quest_state_meta_quest_id RENAME TO idx_user_quest_state_quest_id`,
			`ALTER INDEX IF EXISTS idx_user_meta_quest_state_next_due RENAME TO idx_user_quest_state_next_due`,
			`ALTER INDEX IF EXISTS idx_user_meta_quest_state_user_id RENAME TO idx_user_quest_state_user_id`,
			`ALTER INDEX IF EXISTS idx_quest_events_meta_quest_id RENAME TO idx_quest_events_quest_id`,
			`ALTER INDEX IF EXISTS idx_quest_events_user_meta RENAME TO idx_quest_events_user_quest`,
		}
		for _, statement := range statements {
			if err := tx.Exec(statement).Error; err != nil {
				return fmt.Errorf("%w (statement: %s)", err, statement)
			}
		}
		return nil
	})
}

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
		`ALTER TABLE domain_node_codes ADD CONSTRAINT domain_node_codes_node_type_check CHECK (node_type IN ('definition','exercise','source','quest'));`,

		`ALTER TABLE node_relations DROP CONSTRAINT IF EXISTS node_relations_from_type_check;`,
		`ALTER TABLE node_relations DROP CONSTRAINT IF EXISTS node_relations_to_type_check;`,
		`UPDATE node_relations SET from_type = 'definition' WHERE from_type = 'meta_definition';`,
		`UPDATE node_relations SET from_type = 'exercise' WHERE from_type = 'meta_exercise';`,
		`UPDATE node_relations SET to_type = 'definition' WHERE to_type = 'meta_definition';`,
		`UPDATE node_relations SET to_type = 'exercise' WHERE to_type = 'meta_exercise';`,
		`ALTER TABLE node_relations ADD CONSTRAINT node_relations_from_type_check CHECK (from_type IN ('definition','exercise','source','quest'));`,
		`ALTER TABLE node_relations ADD CONSTRAINT node_relations_to_type_check CHECK (to_type IN ('definition','exercise','source','quest'));`,

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
