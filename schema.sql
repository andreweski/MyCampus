-- MyCampus database schema (SQLite)
-- Purpose: let students create and join meet-ups for studying, fitness, hobbies, etc.
-- Foreign keys are enforced at connection time with: PRAGMA foreign_keys = ON;

-- 1. USERS: every student account
CREATE TABLE IF NOT EXISTS users (
    user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,          -- no duplicate accounts
    password_hash TEXT    NOT NULL,                                -- scrypt salt:hash, never plain text
    first_name    TEXT    NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 50),
    last_name     TEXT    NOT NULL CHECK (length(trim(last_name))  BETWEEN 1 AND 50),
    major         TEXT             CHECK (major IS NULL OR length(major) <= 80),
    bio           TEXT             CHECK (bio   IS NULL OR length(bio)   <= 500),
    role          TEXT    NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 2. SESSIONS: login tokens (one user -> many sessions)
CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT    PRIMARY KEY,                                -- random 256-bit hex
    user_id    INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT    NOT NULL
);

-- 3. CATEGORIES: lookup table (Study, Fitness, ...) so meetups use consistent labels
CREATE TABLE IF NOT EXISTS categories (
    category_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    description TEXT
);

-- 4. MEETUPS: an event a student hosts (one user hosts many meetups; one category has many meetups)
CREATE TABLE IF NOT EXISTS meetups (
    meetup_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id     INTEGER NOT NULL REFERENCES users(user_id)          ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    title       TEXT    NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 100),
    description TEXT    NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
    location    TEXT    NOT NULL CHECK (length(trim(location)) BETWEEN 2 AND 120),
    start_time  TEXT    NOT NULL,                                  -- ISO-8601 'YYYY-MM-DDTHH:MM'
    end_time    TEXT    NOT NULL,
    capacity    INTEGER NOT NULL DEFAULT 10 CHECK (capacity BETWEEN 2 AND 500),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    CHECK (end_time > start_time)
);

-- 5. RSVPS: junction table resolving the many-to-many between users and meetups
CREATE TABLE IF NOT EXISTS rsvps (
    user_id   INTEGER NOT NULL REFERENCES users(user_id)     ON DELETE CASCADE,
    meetup_id INTEGER NOT NULL REFERENCES meetups(meetup_id) ON DELETE CASCADE,
    joined_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, meetup_id)                            -- a student can join a meetup only once
);

-- 6. COMMENTS: discussion posts on a meetup
CREATE TABLE IF NOT EXISTS comments (
    comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    meetup_id  INTEGER NOT NULL REFERENCES meetups(meetup_id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(user_id)     ON DELETE CASCADE,
    body       TEXT    NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 1000),
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 7. USER_INTERESTS: junction table, users <-> categories they care about
CREATE TABLE IF NOT EXISTS user_interests (
    user_id     INTEGER NOT NULL REFERENCES users(user_id)          ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(category_id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, category_id)
);

-- Indexes for the most common lookups
CREATE INDEX IF NOT EXISTS idx_meetups_start    ON meetups(start_time);
CREATE INDEX IF NOT EXISTS idx_meetups_category ON meetups(category_id);
CREATE INDEX IF NOT EXISTS idx_meetups_host     ON meetups(host_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_meetup     ON rsvps(meetup_id);
CREATE INDEX IF NOT EXISTS idx_comments_meetup  ON comments(meetup_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
