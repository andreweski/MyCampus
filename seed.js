// Demo data: `npm run seed` (wipes users/meetups and loads sample data).
// All demo accounts use the password: Password1
const { openDatabase } = require('./index');
const { hashPassword } = require('../utils/password');

function localIso(daysFromNow, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function seed(db = openDatabase()) {
  const cat = Object.fromEntries(db.prepare('SELECT name, category_id FROM categories').all().map((r) => [r.name, r.category_id]));

  const users = [
    ['maya@horizon.csueastbay.edu', 'Maya', 'Lopez', 'Computer Science', 'Junior who loves algorithms and bouldering.'],
    ['jordan@horizon.csueastbay.edu', 'Jordan', 'Kim', 'Kinesiology', 'Always looking for a gym partner.'],
    ['priya@horizon.csueastbay.edu', 'Priya', 'Shah', 'Biology', 'Pre-med, coffee enthusiast, board-game collector.'],
    ['sam@horizon.csueastbay.edu', 'Sam', 'Nguyen', 'Business', 'Treasurer of the Entrepreneurship Club.'],
  ];

  const meetups = [
    [0, 'Study Group', 'CS 3240 Data Structures exam review', 'Going over trees, heaps, and hash tables before the midterm. Bring practice problems!', 'Library, Room 2210', 1, 18, 20, 8],
    [1, 'Fitness', 'Morning run around campus', 'Easy 3-mile pace, all levels welcome.', 'Pioneer Gym entrance', 2, 7, 8, 12],
    [2, 'Hobbies', 'Board game night', 'Catan, Codenames, and snacks. New players welcome.', 'University Union, Room 311', 3, 19, 22, 10],
    [3, 'Career', 'Resume review swap', 'Trade resumes and give each other feedback before the career fair.', 'Career Center', 5, 15, 16, 6],
    [0, 'Social', 'Coffee & chat for transfer students', 'Meet other transfer students in a relaxed setting.', 'Starbucks, University Union', 4, 11, 12, 15],
    [1, 'Fitness', 'Pickup basketball', '5v5 pickup games — just show up.', 'Pioneer Gym, Court B', 6, 17, 19, 20],
    [2, 'Study Group', 'Organic Chemistry problem session', 'Working through chapter 8 reaction mechanisms.', 'Science North, Room 225', -3, 14, 16, 8],
  ];

  db.transaction(() => {
    db.exec('DELETE FROM comments; DELETE FROM rsvps; DELETE FROM meetups; DELETE FROM user_interests; DELETE FROM sessions; DELETE FROM users;');
    const insUser = db.prepare('INSERT INTO users (email, password_hash, first_name, last_name, major, bio) VALUES (?, ?, ?, ?, ?, ?)');
    // hashPassword is called per user so every account gets its own random salt (and a different hash).
    const ids = users.map(([e, f, l, m, b]) => insUser.run(e, hashPassword('Password1'), f, l, m, b).lastInsertRowid);

    const insM = db.prepare(`INSERT INTO meetups (host_id, category_id, title, description, location, start_time, end_time, capacity)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const insR = db.prepare('INSERT OR IGNORE INTO rsvps (user_id, meetup_id) VALUES (?, ?)');
    const insC = db.prepare('INSERT INTO comments (meetup_id, user_id, body) VALUES (?, ?, ?)');
    const insI = db.prepare('INSERT INTO user_interests (user_id, category_id) VALUES (?, ?)');

    meetups.forEach(([hostIdx, c, title, desc, loc, day, sh, eh, cap], i) => {
      const mid = insM.run(ids[hostIdx], cat[c], title, desc, loc, localIso(day, sh), localIso(day, eh), cap).lastInsertRowid;
      insR.run(ids[hostIdx], mid);
      ids.forEach((uid, j) => { if ((i + j) % 2 === 0) insR.run(uid, mid); });
      if (i === 0) {
        insC.run(mid, ids[2], 'Will we cover AVL rotations too?');
        insC.run(mid, ids[0], 'Yes! I will bring a worksheet on rotations.');
      }
    });

    [[0, 'Study Group'], [0, 'Hobbies'], [1, 'Fitness'], [2, 'Study Group'], [2, 'Hobbies'], [3, 'Career'], [3, 'Clubs & Orgs']]
      .forEach(([u, c]) => insI.run(ids[u], cat[c]));
  })();

  return db;
}

if (require.main === module) {
  const db = seed();
  const n = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  console.log(`Seeded: ${n('users')} users, ${n('meetups')} meetups, ${n('rsvps')} RSVPs, ${n('comments')} comments.`);
  console.log('Log in with maya@horizon.csueastbay.edu / Password1');
  db.close();
}

module.exports = { seed };
