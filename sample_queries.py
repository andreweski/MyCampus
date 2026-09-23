"""Prints example SQL queries + constraint tests against a seeded DB (evidence for the report).
Usage: DB_PATH=/tmp/demo.db npm run seed && python scripts/sample_queries.py /tmp/demo.db"""
import sqlite3, sys
con = sqlite3.connect(sys.argv[1] if len(sys.argv) > 1 else "data/mycampus.db")
qs = [("Tables in the database", "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"),
("Categories (lookup table)", "SELECT category_id, name FROM categories"),
("Meetups with host name, category and live attendee count (JOIN + subquery used by GET /api/meetups)", """SELECT m.meetup_id, m.title, c.name AS category, u.first_name||' '||u.last_name AS host,
 (SELECT COUNT(*) FROM rsvps r WHERE r.meetup_id=m.meetup_id) AS going, m.capacity
 FROM meetups m JOIN categories c ON c.category_id=m.category_id JOIN users u ON u.user_id=m.host_id ORDER BY m.start_time"""),
("Who is going to meetup 1 (many-to-many via rsvps)", "SELECT u.first_name, u.last_name, r.joined_at FROM rsvps r JOIN users u ON u.user_id=r.user_id WHERE r.meetup_id=1"),
("Users and their interests", "SELECT u.first_name, GROUP_CONCAT(c.name, ', ') AS interests FROM users u LEFT JOIN user_interests ui ON ui.user_id=u.user_id LEFT JOIN categories c ON c.category_id=ui.category_id GROUP BY u.user_id"),
("Passwords are salted + hashed (same password, different hashes)", "SELECT email, substr(password_hash,1,40)||'...' AS password_hash FROM users"),
]
for title, q in qs:
    cur = con.execute(q); cols = [d[0] for d in cur.description]
    print(f"-- {title}\n{' '.join(q.split())};"); print(" | ".join(cols))
    for r in cur.fetchall(): print(" | ".join(str(x) for x in r))
    print()
con.execute("PRAGMA foreign_keys=ON")
print("-- Constraint tests (each statement should be REJECTED by the database)")
for q in ["INSERT INTO users (email,password_hash,first_name,last_name) VALUES ('MAYA@horizon.csueastbay.edu','x','A','B')",
          "INSERT INTO rsvps (user_id, meetup_id) VALUES (1, 1)",
          "INSERT INTO rsvps (user_id, meetup_id) VALUES (999, 1)",
          "INSERT INTO meetups (host_id,category_id,title,location,start_time,end_time) VALUES (1,1,'Bad','Library','2030-01-02T10:00','2030-01-01T10:00')",
          "INSERT INTO meetups (host_id,category_id,title,location,start_time,end_time,capacity) VALUES (1,1,'Big','Library','2030-01-01T10:00','2030-01-01T11:00',9999)",
          "INSERT INTO comments (meetup_id,user_id,body) VALUES (1,1,'   ')",
          "DELETE FROM categories WHERE category_id=1"]:
    try: con.execute(q); print("ACCEPTED (unexpected):", q)
    except Exception as e: print(f"{q};\n   -> REJECTED: {e}")
