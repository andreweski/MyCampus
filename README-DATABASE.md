# MyCampus: Database

This is the database layer for MyCampus: a SQLite database with 7 related tables (users, sessions, categories, meetups, rsvps, comments, user_interests).

Full design notes, the ERD and the constraint rules are in [docs/DATABASE.md](docs/DATABASE.md).

## Files

| File | Purpose |
|---|---|
| `src/db/schema.sql` | `CREATE TABLE` statements: primary keys, foreign keys, UNIQUE/CHECK constraints, indexes |
| `src/db/index.js` | `openDatabase()`: creates `data/mycampus.db`, turns on foreign keys, applies the schema, adds the default categories |
| `src/db/seed.js` | Loads demo users, meetups, RSVPs, comments and interests |
| `src/utils/password.js` | Salted scrypt password hashing (used for user accounts) |
| `tests/db.test.js` | Tests for the schema, constraints and cascades |
| `scripts/sample_queries.py` | Example queries and constraint checks (evidence) |
| `docs/` | DATABASE.md, ERD (`erd.png`, `erd.svg`, `erd.dot`), query output |

## Use

```bash
npm install          # installs better-sqlite3
npm run seed         # creates data/mycampus.db with demo data
npm run test:db      # runs the database tests
```

Demo accounts use the password `Password1` (for example `maya@horizon.csueastbay.edu`).

From backend code:

```js
const { openDatabase } = require('./src/db');
const db = openDatabase();                       // data/mycampus.db (or DB_PATH)
const meetups = db.prepare('SELECT * FROM meetups WHERE category_id = ?').all(1);
```
