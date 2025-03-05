-- db/init-scripts/init-sql.sql
-- Initialize database schema

--Crea tabla usuarios
CREATE TABLE IF NOT EXISTS usuario(
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    contrasena VARCHAR(255) NOT NULL,
    nivel VARCHAR(20),
    nombre VARCHAR(30),
    apellido VARCHAR(100)
);

--Crea tabla temario
CREATE TABLE IF NOT EXISTS temario (
    id_temario SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    privacidad VARCHAR(20) CHECK (privacidad IN ('publico', 'privado')) NOT NULL,
    dueno INT NOT NULL,
    FOREIGN KEY (dueno) REFERENCES usuario(id) ON DELETE CASCADE
);

--Crea tabla de estudiantes_temario
CREATE TABLE IF NOT EXISTS estudiantes_temario(
    usuario_id INT NOT NULL,
    temario_id INT NOT NULL,
    fecha_inscripcion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    avance NUMERIC(5,2) CHECK (avance BETWEEN 0 AND 100),
    PRIMARY KEY (usuario_id, temario_id),
    FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
    FOREIGN KEY (temario_id) REFERENCES temario(id_temario) ON DELETE CASCADE
);

--Crea tabla comentarios_temario
CREATE TABLE IF NOT EXISTS comentarios_temario (
    id_comentario SERIAL PRIMARY KEY,
    contenido VARCHAR(1000) NOT NULL,
    id_temario INT NOT NULL,
    FOREIGN KEY (id_temario) REFERENCES temario(id_temario) ON DELETE CASCADE
);

--Crea tabla tema
CREATE TABLE IF NOT EXISTS tema (
    id_tema SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    info VARCHAR(100000) NOT NULL,
    dueno INT NOT NULL,
    id_temario INT NOT NULL,
    FOREIGN KEY (dueno) REFERENCES usuario(id) ON DELETE CASCADE,
    FOREIGN KEY (id_temario) REFERENCES temario(id_temario) ON DELETE CASCADE
);

--Crea tabla jerarquie_temas
CREATE TABLE IF NOT EXISTS jerarquia_temas(
    padre_id INT NOT NULL,
    hijo_id INT NOT NULL,
    PRIMARY KEY (padre_id, hijo_id),
    FOREIGN KEY (padre_id) REFERENCES tema(id_tema) ON DELETE CASCADE,
    FOREIGN KEY (hijo_id) REFERENCES tema(id_tema) ON DELETE CASCADE
);

--Crea tabla estudiantes_tema
CREATE TABLE IF NOT EXISTS estudiantes_tema(
    usuario_id INT NOT NULL,
    tema_id INT NOT NULL,
    ultima_fecha_repaso TIMESTAMP,
    avance NUMERIC(5,2) CHECK (avance BETWEEN 0 AND 100),
    contador INT,
    PRIMARY KEY (usuario_id, tema_id),
    FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE,
    FOREIGN KEY (tema_id) REFERENCES tema(id_tema) ON DELETE CASCADE
);

--Crea tabla ejercicios
CREATE TABLE IF NOT EXISTS ejercicio(
    id_ejercicio SERIAL PRIMARY KEY,
    tema_id INT NOT NULL,
    dificultad VARCHAR(20) CHECK (dificultad IN ('facil', 'moderado','dificil')) NOT NULL,
    contenido JSONB,
    FOREIGN KEY (tema_id) REFERENCES tema(id_tema) ON DELETE CASCADE
);

--Crea tabla material
CREATE TABLE IF NOT EXISTS material(
    id_material SERIAL PRIMARY KEY,
    tema_id INT NOT NULL,
    tipo VARCHAR(20),
    contenido BYTEA NOT NULL,
    FOREIGN KEY (tema_id) REFERENCES tema(id_tema) ON DELETE CASCADE
);


-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create example table for your app
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE  -- Added deleted_at
);

-- Add indices
CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);

-- Add unique constraints if they don't exist
ALTER TABLE users
ADD CONSTRAINT unique_username UNIQUE (username);
ALTER TABLE users
ADD CONSTRAINT unique_email UNIQUE (email);
