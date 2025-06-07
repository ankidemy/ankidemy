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
    is_admin BOOLEAN DEFAULT FALSE
);

-- Knowledge domains (previously "temario")
CREATE TABLE IF NOT EXISTS domains (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    privacy VARCHAR(20) CHECK (privacy IN ('public', 'private')) NOT NULL,
    owner_id INT NOT NULL,
    description TEXT,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Domain comments
CREATE TABLE IF NOT EXISTS domain_comments (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    domain_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Definitions 
CREATE TABLE IF NOT EXISTS definitions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL,  -- Removed UNIQUE constraint, code is for ordering
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    notes TEXT,
    domain_id INT NOT NULL,
    owner_id INT NOT NULL,
    x_position FLOAT,
    y_position FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Definition references
CREATE TABLE IF NOT EXISTS definition_references (
    id SERIAL PRIMARY KEY,
    definition_id INT NOT NULL,
    reference TEXT NOT NULL,
    FOREIGN KEY (definition_id) REFERENCES definitions(id) ON DELETE CASCADE
);

-- Definition prerequisites relationship
CREATE TABLE IF NOT EXISTS definition_prerequisites (
    definition_id INT NOT NULL,
    prerequisite_id INT NOT NULL,
    PRIMARY KEY (definition_id, prerequisite_id),
    FOREIGN KEY (definition_id) REFERENCES definitions(id) ON DELETE CASCADE,
    FOREIGN KEY (prerequisite_id) REFERENCES definitions(id) ON DELETE CASCADE
);

-- Exercises
CREATE TABLE IF NOT EXISTS exercises (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL,  -- Removed UNIQUE constraint, code is for ordering
    name VARCHAR(200) NOT NULL,
    statement TEXT NOT NULL,
    description TEXT,
    notes TEXT,
    hints TEXT,
    domain_id INT NOT NULL,
    owner_id INT NOT NULL,
    verifiable BOOLEAN DEFAULT FALSE,
    result TEXT,
    difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 7),  -- Changed to integer 1-7
    x_position FLOAT,
    y_position FLOAT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Exercise prerequisites relationship
CREATE TABLE IF NOT EXISTS exercise_prerequisites (
    exercise_id INT NOT NULL,
    prerequisite_id INT NOT NULL,
    PRIMARY KEY (exercise_id, prerequisite_id),
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
    FOREIGN KEY (prerequisite_id) REFERENCES definitions(id) ON DELETE CASCADE
);

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

-- User definition progress - supports spaced repetition like Anki
CREATE TABLE IF NOT EXISTS user_definition_progress (
    user_id INT NOT NULL,
    definition_id INT NOT NULL,
    learned BOOLEAN DEFAULT FALSE,
    last_review TIMESTAMP,
    next_review TIMESTAMP,
    easiness_factor NUMERIC(4,3) DEFAULT 2.5,
    interval_days INT DEFAULT 0,
    repetitions INT DEFAULT 0,
    PRIMARY KEY (user_id, definition_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (definition_id) REFERENCES definitions(id) ON DELETE CASCADE
);

-- User exercise progress
CREATE TABLE IF NOT EXISTS user_exercise_progress (
    user_id INT NOT NULL,
    exercise_id INT NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    correct BOOLEAN DEFAULT FALSE,
    attempts INT DEFAULT 0,
    last_attempt TIMESTAMP,
    PRIMARY KEY (user_id, exercise_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

-- Study sessions
CREATE TABLE IF NOT EXISTS study_sessions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    domain_id INT NOT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

-- Session definitions reviewed
CREATE TABLE IF NOT EXISTS session_definitions (
    session_id INT NOT NULL,
    definition_id INT NOT NULL,
    review_result VARCHAR(20) CHECK (review_result IN ('again', 'hard', 'good', 'easy')),
    time_taken INT, -- in seconds
    PRIMARY KEY (session_id, definition_id),
    FOREIGN KEY (session_id) REFERENCES study_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (definition_id) REFERENCES definitions(id) ON DELETE CASCADE
);

-- Session exercises completed
CREATE TABLE IF NOT EXISTS session_exercises (
    session_id INT NOT NULL,
    exercise_id INT NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    correct BOOLEAN DEFAULT FALSE,
    time_taken INT, -- in seconds
    PRIMARY KEY (session_id, exercise_id),
    FOREIGN KEY (session_id) REFERENCES study_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);
