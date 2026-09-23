// Database connection: opens (or creates) the SQLite file, enforces foreign keys,
// and applies the schema so the app can run on a fresh checkout with no setup.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_CATEGORIES = [
  ['Study Group', 'Study sessions, homework help, and exam prep'],
  ['Fitness', 'Working out, running, gym partners, and sports'],
  ['Hobbies', 'Gaming, art, music, photography, and other interests'],
  ['Social', 'Hangouts, food, and meeting new people'],
  ['Clubs & Orgs', 'Club meetings and student organization events'],
  ['Career', 'Resume reviews, networking, and interview practice'],
];

function openDatabase(dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'mycampus.db')) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');   // better concurrency for a web server
  db.pragma('foreign_keys = ON');    // SQLite does NOT enforce FKs unless this is on

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Lookup data every install needs. INSERT OR IGNORE + UNIQUE(name) prevents duplicates on restart.
  const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)');
  db.transaction(() => DEFAULT_CATEGORIES.forEach(([n, d]) => insertCategory.run(n, d)))();

  // Housekeeping: drop expired login sessions.
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();

  return db;
}

module.exports = { openDatabase, DEFAULT_CATEGORIES };
