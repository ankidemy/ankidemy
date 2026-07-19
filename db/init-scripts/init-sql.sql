-- db/init-scripts/init-sql.sql

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    level VARCHAR(20) DEFAULT 'user',
    first_name VARCHAR(30),
    last_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge domains
CREATE TABLE IF NOT EXISTS domains (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    privacy VARCHAR(20) CHECK (privacy IN ('public', 'private')) NOT NULL,
    owner_id INT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Domain comments
CREATE TABLE IF NOT EXISTS domain_comments (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    domain_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Definitions 
CREATE TABLE IF NOT EXISTS definitions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    notes TEXT,
    prompt_image_path TEXT,
    description_image_path TEXT,
    domain_id INT NOT NULL,
    owner_id INT NOT NULL,
    x_position DECIMAL(10,2) DEFAULT 0,
    y_position DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Definition references
CREATE TABLE IF NOT EXISTS definition_references (
    id SERIAL PRIMARY KEY,
    definition_id INT NOT NULL,
    reference TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    FOREIGN KEY (definition_id) REFERENCES definitions(id) ON DELETE CASCADE
);

-- Exercises
CREATE TABLE IF NOT EXISTS exercises (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    statement TEXT NOT NULL,
    description TEXT,
    notes TEXT,
    hints TEXT,
    statement_image_path TEXT,
    description_image_path TEXT,
    domain_id INT NOT NULL,
    owner_id INT NOT NULL,
    verifiable BOOLEAN DEFAULT FALSE,
    result TEXT,
    difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 7),
    x_position DECIMAL(10,2) DEFAULT 0,
    y_position DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- UNIFIED PREREQUISITE SYSTEM (Single Source of Truth)
-- ============================================================================

-- Node prerequisites table (ONLY table for prerequisite relationships)
CREATE TABLE IF NOT EXISTS node_prerequisites (
    id SERIAL PRIMARY KEY,
    node_id INTEGER NOT NULL, -- definition or exercise ID
    node_type VARCHAR(20) NOT NULL CHECK (node_type IN ('definition', 'exercise')),
    prerequisite_id INTEGER NOT NULL, -- prerequisite definition/exercise ID  
    prerequisite_type VARCHAR(20) NOT NULL CHECK (prerequisite_type IN ('definition', 'exercise')),
    weight DECIMAL(3,2) DEFAULT 1.0 CHECK (weight > 0 AND weight <= 1.0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(node_id, node_type, prerequisite_id, prerequisite_type),
    CHECK (NOT (node_id = prerequisite_id AND node_type = prerequisite_type))
);

-- ============================================================================
-- NODE GROUPS (Graph clustering / collapse)
-- ============================================================================

CREATE TABLE IF NOT EXISTS node_groups (
    id SERIAL PRIMARY KEY,
    domain_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    is_exact BOOLEAN DEFAULT FALSE,
    x_position DECIMAL(10,2) DEFAULT 0,
    y_position DECIMAL(10,2) DEFAULT 0,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS node_group_seeds (
    id SERIAL PRIMARY KEY,
    group_id INT NOT NULL,
    node_id INT NOT NULL,
    node_type VARCHAR(20) NOT NULL CHECK (node_type IN ('definition', 'exercise')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, node_id, node_type),
    FOREIGN KEY (group_id) REFERENCES node_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS node_group_members (
    id SERIAL PRIMARY KEY,
    group_id INT NOT NULL,
    node_id INT NOT NULL,
    node_type VARCHAR(20) NOT NULL CHECK (node_type IN ('definition', 'exercise')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, node_id, node_type),
    FOREIGN KEY (group_id) REFERENCES node_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_group_states (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    group_id INT NOT NULL,
    collapsed BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, group_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES node_groups(id) ON DELETE CASCADE
);

-- ============================================================================
-- SRS SYSTEM TABLES
-- ============================================================================

-- User node progress table (SRS state for each user-node pair)
CREATE TABLE IF NOT EXISTS user_node_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    node_type VARCHAR(20) NOT NULL CHECK (node_type IN ('definition', 'exercise')),
    status VARCHAR(20) CHECK (status IN ('fresh', 'tackling', 'grasped', 'learned')) DEFAULT 'fresh',
    easiness_factor DECIMAL(3,2) DEFAULT 2.5 CHECK (easiness_factor >= 1.3),
    interval_days DECIMAL(8,2) DEFAULT 0,
    repetitions INTEGER DEFAULT 0,
    last_review TIMESTAMP,
    next_review TIMESTAMP,
    accumulated_credit DECIMAL(5,3) DEFAULT 0 CHECK (accumulated_credit >= -1.0 AND accumulated_credit <= 1.0),
    credit_postponed BOOLEAN DEFAULT FALSE,
    total_reviews INTEGER DEFAULT 0,
    successful_reviews INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, node_id, node_type)
);

-- Study sessions table
CREATE TABLE IF NOT EXISTS study_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    domain_id INTEGER NOT NULL,
    session_type VARCHAR(20) CHECK (session_type IN ('definition', 'exercise', 'mixed')) NOT NULL,
    mode VARCHAR(20) CHECK (mode IN ('normal', 'frenzy')) NOT NULL DEFAULT 'normal',
    runtime_state JSONB,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    total_reviews INTEGER DEFAULT 0,
    successful_reviews INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

-- Session reviews table (individual reviews within sessions)
CREATE TABLE IF NOT EXISTS session_reviews (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    node_type VARCHAR(20) NOT NULL CHECK (node_type IN ('definition', 'exercise')),
    review_type VARCHAR(20) CHECK (review_type IN ('explicit', 'implicit')) NOT NULL,
    review_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    quality INTEGER CHECK (quality >= 0 AND quality <= 5),
    time_taken INTEGER, -- in seconds
    credit_applied DECIMAL(5,3) DEFAULT 1.0,
    FOREIGN KEY (session_id) REFERENCES study_sessions(id) ON DELETE CASCADE
);

-- Review history table (complete review history for analytics)
CREATE TABLE IF NOT EXISTS review_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    node_type VARCHAR(20) NOT NULL CHECK (node_type IN ('definition', 'exercise')),
    review_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    review_type VARCHAR(20) CHECK (review_type IN ('explicit', 'implicit')) NOT NULL,
    success BOOLEAN NOT NULL,
    quality INTEGER CHECK (quality >= 0 AND quality <= 5),
    time_taken INTEGER, -- in seconds
    credit_applied DECIMAL(5,3) DEFAULT 1.0,
    easiness_factor_before DECIMAL(3,2),
    easiness_factor_after DECIMAL(3,2),
    interval_before DECIMAL(8,2),
    interval_after DECIMAL(8,2),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- DOMAIN ENROLLMENT
-- ============================================================================

-- User domain enrollment
CREATE TABLE IF NOT EXISTS user_domain_progress (
    user_id INT NOT NULL,
    domain_id INT NOT NULL,
    enrollment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    progress NUMERIC(5,2) CHECK (progress BETWEEN 0 AND 100) DEFAULT 0,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, domain_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

-- ============================================================================
-- SOURCES + QUESTS + RELATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    domain_id INT NOT NULL,
    owner_id INT NOT NULL,
    code VARCHAR(80) NOT NULL,
    title TEXT NOT NULL,
    content_md TEXT NOT NULL DEFAULT '',
    bibtex_key TEXT NULL,
    file_path TEXT NULL,
    x_position DECIMAL(10,2) DEFAULT 0,
    y_position DECIMAL(10,2) DEFAULT 0,
    visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','domain')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quests (
    id SERIAL PRIMARY KEY,
    domain_id INT NOT NULL,
    owner_id INT NOT NULL,
    code VARCHAR(80) NOT NULL,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('todo','habit','daily')),
    schedule JSONB NOT NULL,
    x_position DECIMAL(10,2) DEFAULT 0,
    y_position DECIMAL(10,2) DEFAULT 0,
    visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','domain')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quest_versions (
    id SERIAL PRIMARY KEY,
    quest_id INT NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    description_md TEXT NOT NULL DEFAULT '',
    task_list JSONB NULL,
    image_path TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quest_versions_order
    ON quest_versions (quest_id, display_order, id);

CREATE TABLE IF NOT EXISTS user_quest_state (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    quest_id INT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    next_due_at TIMESTAMP NULL,
    snoozed_until TIMESTAMP NULL,
    last_presented_at TIMESTAMP NULL,
    last_completed_at TIMESTAMP NULL,
    current_streak INT NOT NULL DEFAULT 0,
    current_period_key TEXT NULL,
    current_period_count INT NOT NULL DEFAULT 0,
    last_shown_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, quest_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quest_events (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    quest_id INT NOT NULL,
    quest_version_id INT NULL,
    event_type VARCHAR(30) NOT NULL,
    happened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note TEXT NULL,
    payload JSONB NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE,
    FOREIGN KEY (quest_version_id) REFERENCES quest_versions(id)
);

CREATE TABLE IF NOT EXISTS node_relations (
    id SERIAL PRIMARY KEY,
    domain_id INT NOT NULL,
    from_type VARCHAR(20) NOT NULL CHECK (from_type IN ('definition','exercise','source','quest')),
    from_id INT NOT NULL,
    to_type VARCHAR(20) NOT NULL CHECK (to_type IN ('definition','exercise','source','quest')),
    to_id INT NOT NULL,
    relation_type VARCHAR(50) NOT NULL,
    context_key TEXT NOT NULL DEFAULT '',
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_type, from_id, to_type, to_id, relation_type, context_key),
    CHECK (NOT (from_type = to_type AND from_id = to_id)),
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS domain_node_codes (
    id SERIAL PRIMARY KEY,
    domain_id INT NOT NULL,
    code VARCHAR(80) NOT NULL,
    node_type VARCHAR(20) NOT NULL CHECK (node_type IN ('definition','exercise','source','quest')),
    node_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(domain_id, code),
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_domain_settings (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    domain_id INT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    daily_quest_limit INT NOT NULL DEFAULT 1,
    daily_quest_cooldown_days INT NOT NULL DEFAULT 7,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, domain_id)
);

CREATE TABLE IF NOT EXISTS user_daily_quest_draws (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    domain_id INT NOT NULL,
    date_key TEXT NOT NULL,
    quest_ids JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, domain_id, date_key)
);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Updated_at triggers
CREATE TRIGGER update_user_node_progress_updated_at
    BEFORE UPDATE ON user_node_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domains_updated_at
    BEFORE UPDATE ON domains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_definitions_updated_at
    BEFORE UPDATE ON definitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exercises_updated_at
    BEFORE UPDATE ON exercises
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_node_prerequisites_node ON node_prerequisites(node_id, node_type);
CREATE INDEX IF NOT EXISTS idx_node_prerequisites_prereq ON node_prerequisites(prerequisite_id, prerequisite_type);
CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_node_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_next_review ON user_node_progress(next_review);
CREATE INDEX IF NOT EXISTS idx_user_progress_status ON user_node_progress(status);
CREATE INDEX IF NOT EXISTS idx_user_progress_node ON user_node_progress(node_id, node_type);
CREATE INDEX IF NOT EXISTS idx_review_history_user_node ON review_history(user_id, node_id, node_type);
CREATE INDEX IF NOT EXISTS idx_session_reviews_session ON session_reviews(session_id);
CREATE INDEX IF NOT EXISTS idx_definitions_domain ON definitions(domain_id);
CREATE INDEX IF NOT EXISTS idx_exercises_domain ON exercises(domain_id);
CREATE INDEX IF NOT EXISTS idx_definitions_code_domain ON definitions(code, domain_id);
CREATE INDEX IF NOT EXISTS idx_exercises_code_domain ON exercises(code, domain_id);
CREATE INDEX IF NOT EXISTS idx_node_groups_domain ON node_groups(domain_id);
CREATE INDEX IF NOT EXISTS idx_group_seeds_group ON node_group_seeds(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON node_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_user_group_states_user ON user_group_states(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_domain_owner_visibility ON sources(domain_id, owner_id, visibility);
CREATE INDEX IF NOT EXISTS idx_sources_domain_code ON sources(domain_id, code);
CREATE INDEX IF NOT EXISTS idx_quests_domain_code ON quests(domain_id, code);
CREATE INDEX IF NOT EXISTS idx_user_quest_state_next_due ON user_quest_state(user_id, next_due_at);
CREATE INDEX IF NOT EXISTS idx_user_quest_state_quest ON user_quest_state(user_id, quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_events_user_quest ON quest_events(user_id, quest_id, happened_at);
CREATE INDEX IF NOT EXISTS idx_node_relations_domain ON node_relations(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_node_codes_domain_node ON domain_node_codes(domain_id, node_type, node_id);
