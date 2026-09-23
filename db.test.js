// Database-only tests: schema, keys, constraints, cascades and seed data.
// Run with: npm run test:db
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../src/db');
const { seed } = require('../src/db/seed');

const db = seed(openDatabase(':memory:'));
const count = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;

test('all 7 tables exist', () => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
  assert.deepEqual(tables, ['categories', 'comments', 'meetups', 'rsvps', 'sessions', 'user_interests', 'users']);
});

test('seed data loads', () => {
  assert.equal(count('categories'), 6);
  assert.equal(count('users'), 4);
  assert.equal(count('meetups'), 7);
  assert.ok(count('rsvps') > 0);
});

test('reopening does not duplicate categories', () => {
  const { DEFAULT_CATEGORIES } = require('../src/db');
  const ins = db.prepare('INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)');
  DEFAULT_CATEGORIES.forEach(([n, d]) => ins.run(n, d));
  assert.equal(count('categories'), 6);
});

test('passwords are salted hashes, unique per user', () => {
  const hashes = db.prepare('SELECT password_hash FROM users').all().map((r) => r.password_hash);
  hashes.forEach((h) => assert.match(h, /^[0-9a-f]{32}:[0-9a-f]{128}$/));
  assert.equal(new Set(hashes).size, hashes.length);
});

test('duplicate email (any case) rejected', () => {
  assert.throws(() => db.prepare("INSERT INTO users (email,password_hash,first_name,last_name) VALUES ('MAYA@horizon.csueastbay.edu','x','A','B')").run(), /UNIQUE/);
});

test('joining the same meetup twice rejected', () => {
  assert.throws(() => db.prepare('INSERT INTO rsvps (user_id, meetup_id) VALUES (1, 1)').run(), /UNIQUE|PRIMARY/);
});

test('foreign keys enforced', () => {
  assert.throws(() => db.prepare('INSERT INTO rsvps (user_id, meetup_id) VALUES (999, 1)').run(), /FOREIGN KEY/);
  assert.throws(() => db.prepare('DELETE FROM categories WHERE category_id = 1').run(), /FOREIGN KEY/);
});

test('CHECK constraints enforced', () => {
  const ins = db.prepare('INSERT INTO meetups (host_id,category_id,title,location,start_time,end_time,capacity) VALUES (1,1,?,?,?,?,?)');
  assert.throws(() => ins.run('Bad', 'Library', '2030-01-02T10:00', '2030-01-01T10:00', 10), /CHECK/); // end before start
  assert.throws(() => ins.run('Big', 'Library', '2030-01-01T10:00', '2030-01-01T11:00', 9999), /CHECK/); // capacity
  assert.throws(() => ins.run('x', 'Library', '2030-01-01T10:00', '2030-01-01T11:00', 10), /CHECK/);    // title too short
  assert.throws(() => db.prepare("INSERT INTO comments (meetup_id,user_id,body) VALUES (1,1,'   ')").run(), /CHECK/);
});

test('deleting a meetup cascades to rsvps and comments', () => {
  db.prepare('DELETE FROM meetups WHERE meetup_id = 1').run();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rsvps WHERE meetup_id = 1').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM comments WHERE meetup_id = 1').get().n, 0);
});

test('deleting a user cascades to hosted meetups and interests', () => {
  db.prepare('DELETE FROM users WHERE user_id = 2').run();
  assert.equal(db.prepare('SELECT COUNT(*) n FROM meetups WHERE host_id = 2').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM user_interests WHERE user_id = 2').get().n, 0);
});
