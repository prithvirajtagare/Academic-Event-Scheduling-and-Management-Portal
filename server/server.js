/**
 * VIT CSE (AI) Department Event Calendar — single-file backend.
 *
 * This used to be split across ~20 files (config/, data/, models/,
 * repositories/, services/, controllers/, middleware/, utils/). It has
 * been consolidated here for a small prototype project. The sections
 * below are ordered the same way the original layers were, just no
 * longer split into separate files:
 *
 *   1. Config (from .env)
 *   2. Database (MySQL connection + schema)
 *   3. Models (plain data classes + validation)
 *   4. Repositories (SQL queries)
 *   5. Services (business logic / validation orchestration)
 *   6. Auth middleware
 *   7. Express app setup, routes, and startup
 */

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');

require('dotenv').config();

// ---------------------------------------------------------------------------
// 1. Config
// ---------------------------------------------------------------------------

const config = {
  port: process.env.PORT || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'vit-cse-ai-dept-secret-change-me',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'vit_cse_ai_calendar'
  },

  mail: {
    host: process.env.MAIL_HOST || '',
    port: Number(process.env.MAIL_PORT) || 587,
    secure: String(process.env.MAIL_SECURE).toLowerCase() === 'true',
    user: process.env.MAIL_USER || '',
    pass: process.env.MAIL_PASS || '',
    from: process.env.MAIL_FROM || 'VIT CSE (AI) Department Calendar <no-reply@example.com>'
  },

  instituteName: 'Vishwakarma Institute of Technology',
  deptName: 'Computer Science and Engineering (Artificial Intelligence)',
  deptShort: 'CSE (AI)',
  categories: ['workshop', 'seminar', 'fest', 'exam', 'holiday']
};

// ---------------------------------------------------------------------------
// 2. Database — connection pool + schema creation
//    (Table definitions also live in ../database.sql for reference/import.)
// ---------------------------------------------------------------------------

const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true // return DATE/DATETIME columns as 'YYYY-MM-DD' strings, not JS Date objects
});

/** Runs a query and returns just the rows/result (no need to destructure [rows] everywhere). */
async function query(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

/** Creates the schema if it doesn't already exist. Safe to call on every boot. */
async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS admins (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      salt          VARCHAR(255) NOT NULL,
      UNIQUE KEY uq_admins_username (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS events (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      title       VARCHAR(255) NOT NULL,
      date        DATE NOT NULL,
      time        VARCHAR(50) DEFAULT '',
      venue       VARCHAR(255) DEFAULT '',
      description TEXT,
      category    ENUM('workshop', 'seminar', 'fest', 'exam', 'holiday') NOT NULL,
      created_by  VARCHAR(100) DEFAULT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_events_date (date),
      KEY idx_events_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      event_id      INT NOT NULL,
      user_email    VARCHAR(255) NOT NULL,
      remind_before VARCHAR(50) DEFAULT '1 day',
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_reminders_event (event_id),
      CONSTRAINT fk_reminders_event FOREIGN KEY (event_id)
        REFERENCES events (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      email       VARCHAR(255) NOT NULL,
      label       VARCHAR(100) DEFAULT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_contacts_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

/** ISO-8601 string -> MySQL DATETIME literal ('YYYY-MM-DD HH:MM:SS'). */
function toMySQLDateTime(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toISOString().slice(0, 19).replace('T', ' ');
}

// ---------------------------------------------------------------------------
// 3. Models — plain data holders + validation. Not ORM entities, just small
//    classes so validation logic lives next to the shape of the data.
// ---------------------------------------------------------------------------

const CATEGORIES = config.categories;

class Event {
  constructor({ id = null, title, date, time = '', venue = '', description = '', category, createdBy = null, createdAt = null }) {
    this.id = id;
    this.title = title;
    this.date = date; // 'YYYY-MM-DD'
    this.time = time;
    this.venue = venue;
    this.description = description;
    this.category = category;
    this.createdBy = createdBy;
    this.createdAt = createdAt || new Date().toISOString();
  }

  validate() {
    const errors = [];
    if (!this.title || !this.title.trim()) errors.push('Title is required.');
    if (!this.date || !/^\d{4}-\d{2}-\d{2}$/.test(this.date)) errors.push('A valid date (YYYY-MM-DD) is required.');
    if (!CATEGORIES.includes(this.category)) errors.push(`Category must be one of: ${CATEGORIES.join(', ')}.`);
    return errors;
  }

  toJSON() {
    return {
      id: this.id, title: this.title, date: this.date, time: this.time, venue: this.venue,
      description: this.description, category: this.category, createdBy: this.createdBy, createdAt: this.createdAt
    };
  }

  static fromRow(row) {
    return new Event({
      id: row.id, title: row.title, date: row.date, time: row.time, venue: row.venue,
      description: row.description, category: row.category, createdBy: row.created_by, createdAt: row.created_at
    });
  }
}

class Reminder {
  constructor({ id = null, eventId, userEmail, remindBefore = '1 day', createdAt = null }) {
    this.id = id;
    this.eventId = Number(eventId);
    this.userEmail = userEmail;
    this.remindBefore = remindBefore;
    this.createdAt = createdAt || new Date().toISOString();
  }

  validate() {
    const errors = [];
    if (!this.eventId) errors.push('eventId is required.');
    if (!this.userEmail || !/^\S+@\S+\.\S+$/.test(this.userEmail)) errors.push('A valid email address is required.');
    return errors;
  }

  toJSON() {
    return { id: this.id, eventId: this.eventId, userEmail: this.userEmail, remindBefore: this.remindBefore, createdAt: this.createdAt };
  }

  static fromRow(row) {
    return new Reminder({ id: row.id, eventId: row.event_id, userEmail: row.user_email, remindBefore: row.remind_before, createdAt: row.created_at });
  }
}

class Admin {
  constructor({ id = null, username, passwordHash, salt }) {
    this.id = id;
    this.username = username;
    this.passwordHash = passwordHash;
    this.salt = salt;
  }

  static hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { hash, salt };
  }

  verifyPassword(password) {
    const { hash } = Admin.hashPassword(password, this.salt);
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(this.passwordHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  toSafeJSON() {
    return { id: this.id, username: this.username };
  }

  static fromRow(row) {
    return new Admin({ id: row.id, username: row.username, passwordHash: row.password_hash, salt: row.salt });
  }
}

// ---------------------------------------------------------------------------
// 4. Repositories — raw SQL for each table. Kept as plain functions grouped
//    by table instead of repository classes/interfaces.
// ---------------------------------------------------------------------------

const events = {
  async findAll() {
    const rows = await query('SELECT * FROM events ORDER BY date ASC, time ASC');
    return rows.map(Event.fromRow);
  },
  async findById(id) {
    const rows = await query('SELECT * FROM events WHERE id = ? LIMIT 1', [Number(id)]);
    return rows.length ? Event.fromRow(rows[0]) : null;
  },
  async findByDate(date) {
    const rows = await query('SELECT * FROM events WHERE date = ? ORDER BY time ASC', [date]);
    return rows.map(Event.fromRow);
  },
  async findByCategory(category) {
    if (!category || category === 'all') return this.findAll();
    const rows = await query('SELECT * FROM events WHERE category = ? ORDER BY date ASC, time ASC', [category]);
    return rows.map(Event.fromRow);
  },
  async findByMonth(year, month) {
    const rows = await query('SELECT * FROM events WHERE YEAR(date) = ? AND MONTH(date) = ? ORDER BY date ASC', [Number(year), Number(month)]);
    return rows.map(Event.fromRow);
  },
  async findUpcoming(fromDate, limit = 6) {
    const rows = await query('SELECT * FROM events WHERE date >= ? ORDER BY date ASC LIMIT ?', [fromDate, Number(limit)]);
    return rows.map(Event.fromRow);
  },
  async create(instance) {
    const d = instance.toJSON();
    const result = await query(
      `INSERT INTO events (title, date, time, venue, description, category, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.title, d.date, d.time, d.venue, d.description, d.category, d.createdBy, toMySQLDateTime(d.createdAt)]
    );
    instance.id = result.insertId;
    return instance;
  },
  async update(id, patch) {
    const existing = await this.findById(id);
    if (!existing) return null;
    const merged = { ...existing.toJSON(), ...patch, id: existing.id };
    await query(
      `UPDATE events SET title = ?, date = ?, time = ?, venue = ?, description = ?, category = ?, created_by = ?, created_at = ?
       WHERE id = ?`,
      [merged.title, merged.date, merged.time, merged.venue, merged.description, merged.category, merged.createdBy, toMySQLDateTime(merged.createdAt), merged.id]
    );
    return new Event(merged);
  },
  async delete(id) {
    const result = await query('DELETE FROM events WHERE id = ?', [Number(id)]);
    return result.affectedRows > 0;
  }
};

const reminders = {
  async create(instance) {
    const d = instance.toJSON();
    const result = await query(
      'INSERT INTO reminders (event_id, user_email, remind_before, created_at) VALUES (?, ?, ?, ?)',
      [d.eventId, d.userEmail, d.remindBefore, toMySQLDateTime(d.createdAt)]
    );
    instance.id = result.insertId;
    return instance;
  }
};

const admins = {
  async findByUsername(username) {
    const rows = await query('SELECT * FROM admins WHERE username = ? LIMIT 1', [username]);
    return rows.length ? Admin.fromRow(rows[0]) : null;
  },
  async create(instance) {
    const d = instance;
    const result = await query(
      'INSERT INTO admins (username, password_hash, salt) VALUES (?, ?, ?)',
      [d.username, d.passwordHash, d.salt]
    );
    instance.id = result.insertId;
    return instance;
  }
};

const contacts = {
  async findAll() {
    const rows = await query('SELECT * FROM contacts ORDER BY email ASC');
    return rows;
  },
  async create(email, label) {
    const result = await query('INSERT INTO contacts (email, label) VALUES (?, ?)', [email, label || null]);
    return { id: result.insertId, email, label: label || null };
  },
  async delete(id) {
    const result = await query('DELETE FROM contacts WHERE id = ?', [Number(id)]);
    return result.affectedRows > 0;
  }
};

// ---------------------------------------------------------------------------
// Mail — sends the calendar poster image as an email attachment. Requires
// MAIL_HOST / MAIL_USER / MAIL_PASS to be set in .env; until then this
// throws a clear, friendly error instead of a raw connection failure.
// ---------------------------------------------------------------------------

function getMailTransporter() {
  if (!config.mail.host || !config.mail.user || !config.mail.pass) {
    const err = new Error('Email sending is not configured yet. Set MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS and MAIL_FROM in your .env file.');
    err.status = 503;
    throw err;
  }
  return nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: { user: config.mail.user, pass: config.mail.pass }
  });
}

async function sendPosterEmail({ recipients, subject, text, imageDataUrl }) {
  const transporter = getMailTransporter();
  const match = /^data:image\/png;base64,(.+)$/.exec(imageDataUrl || '');
  if (!match) {
    const err = new Error('No valid calendar image was received to attach.');
    err.status = 400;
    throw err;
  }
  const buffer = Buffer.from(match[1], 'base64');

  await transporter.sendMail({
    from: config.mail.from,
    to: recipients.join(', '),
    subject,
    text,
    attachments: [{ filename: 'department-calendar.png', content: buffer, contentType: 'image/png' }]
  });
}

// ---------------------------------------------------------------------------
// 5. Services — validation + orchestration on top of the repositories.
// ---------------------------------------------------------------------------

function validationError(errors) {
  const err = new Error('Validation failed');
  err.status = 400;
  err.details = errors;
  return err;
}

const eventService = {
  listByMonth: (year, month) => events.findByMonth(year, month),
  listByCategory: (category) => events.findByCategory(category),
  listUpcoming: (limit = 6) => events.findUpcoming(new Date().toISOString().slice(0, 10), limit),
  getById: (id) => events.findById(id),
  getByDate: (date) => events.findByDate(date),

  async create(payload, adminUsername) {
    const event = new Event({ ...payload, createdBy: adminUsername });
    const errors = event.validate();
    if (errors.length) throw validationError(errors);
    return events.create(event);
  },

  async update(id, payload) {
    const existing = await events.findById(id);
    if (!existing) {
      const err = new Error('Event not found.');
      err.status = 404;
      throw err;
    }
    const merged = new Event({ ...existing.toJSON(), ...payload, id: existing.id });
    const errors = merged.validate();
    if (errors.length) throw validationError(errors);
    return events.update(id, merged.toJSON());
  },

  delete: (id) => events.delete(id)
};

const reminderService = {
  async optIn(eventId, userEmail, remindBefore = '1 day') {
    const event = await events.findById(eventId);
    if (!event) {
      const err = new Error('Cannot set a reminder for an event that does not exist.');
      err.status = 404;
      throw err;
    }
    const reminder = new Reminder({ eventId, userEmail, remindBefore });
    const errors = reminder.validate();
    if (errors.length) throw validationError(errors);
    return reminders.create(reminder);
  }
};

const authService = {
  /** Call once at startup — seeds a demo admin (admin / admin123) the first time. */
  async init() {
    const existing = await admins.findByUsername('admin');
    if (!existing) {
      const { hash, salt } = Admin.hashPassword('admin123');
      await admins.create({ username: 'admin', passwordHash: hash, salt });
    }
  },

  async login(username, password) {
    const admin = await admins.findByUsername(username);
    if (!admin) return null;
    return admin.verifyPassword(password) ? admin.toSafeJSON() : null;
  }
};

/** Builds the calendar grid cells (empty leading cells + one cell per day, each with its events attached). */
function buildCalendarCells(year, month, eventsForMonth) {
  const eventsByDate = {};
  eventsForMonth.forEach((e) => {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  });

  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = 0; i < firstDow; i++) cells.push({ empty: true });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ empty: false, day: d, date: dateStr, events: eventsByDate[dateStr] || [] });
  }
  return cells;
}

// ---------------------------------------------------------------------------
// 6. Auth middleware
// ---------------------------------------------------------------------------

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ success: false, message: 'Admin login required.' });
}

// ---------------------------------------------------------------------------
// 7. Express app, routes, startup
// ---------------------------------------------------------------------------

const SEED_EVENTS = [
  { title: 'Orientation Day', date: '2026-08-04', time: '9:00 am', venue: 'Main auditorium', description: 'Welcome session for new students joining the department this year.', category: 'workshop', createdBy: 'admin', createdAt: '2026-08-01T00:00:00.000Z' },
  { title: 'Tech Talk: AI', date: '2026-08-12', time: '2:00 pm', venue: 'Seminar hall B', description: 'Guest lecture on recent advances in applied machine learning, open to all years.', category: 'seminar', createdBy: 'admin', createdAt: '2026-08-01T00:00:00.000Z' },
  { title: 'Coding Fest', date: '2026-08-20', time: '10:00 am', venue: 'CS block lawn', description: 'Three-day inter-college coding competition begins.', category: 'fest', createdBy: 'admin', createdAt: '2026-08-01T00:00:00.000Z' },
  { title: 'Faculty Meet', date: '2026-08-27', time: '11:00 am', venue: 'Conference room', description: 'Monthly faculty coordination meeting for the department.', category: 'workshop', createdBy: 'admin', createdAt: '2026-08-01T00:00:00.000Z' }
];

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'client', 'views'));

app.use(express.json({ limit: '10mb' })); // poster images sent as base64 can be a few MB
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, '..', 'client', 'public')));

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 4 } // 4 hours
}));

// Available to every EJS view without repeating in every render() call.
app.use((req, res, next) => {
  res.locals.instituteName = config.instituteName;
  res.locals.deptName = config.deptName;
  res.locals.deptShort = config.deptShort;
  next();
});

// --- Page ---

app.get('/', async (req, res, next) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
    const category = req.query.category || 'all';
    const selectedDate = req.query.date || null;

    const monthEvents = await eventService.listByMonth(year, month);
    const cells = buildCalendarCells(year, month, monthEvents);
    const upcoming = await eventService.listUpcoming(6);
    const selectedEvents = selectedDate ? await eventService.getByDate(selectedDate) : [];

    let prevMonth = month - 1, prevYear = year;
    if (prevMonth < 1) { prevMonth = 12; prevYear -= 1; }
    let nextMonth = month + 1, nextYear = year;
    if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }

    res.render('index', {
      year, month, category, selectedDate, cells,
      upcoming, selectedEvents,
      prevMonth, prevYear, nextMonth, nextYear,
      isAdmin: !!(req.session && req.session.admin),
      admin: (req.session && req.session.admin) || null,
      categories: config.categories,
      today: now.toISOString().slice(0, 10)
    });
  } catch (err) {
    next(err);
  }
});

// --- Auth API ---

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const admin = await authService.login(username, password);
    if (!admin) return res.status(401).json({ success: false, message: 'Incorrect username or password.' });
    req.session.admin = admin;
    res.json({ success: true, admin });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// --- Events API ---

app.get('/api/events', async (req, res, next) => {
  try {
    const list = await eventService.listByCategory(req.query.category || 'all');
    res.json(list.map((e) => e.toJSON()));
  } catch (err) {
    next(err);
  }
});

app.get('/api/events/:date', async (req, res, next) => {
  try {
    const list = await eventService.getByDate(req.params.date);
    res.json(list.map((e) => e.toJSON()));
  } catch (err) {
    next(err);
  }
});

app.post('/api/events', requireAdmin, async (req, res) => {
  try {
    const event = await eventService.create(req.body, req.session.admin.username);
    res.status(201).json(event.toJSON());
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.details ? err.details.join(' ') : err.message });
  }
});

app.put('/api/events/:id', requireAdmin, async (req, res) => {
  try {
    const event = await eventService.update(req.params.id, req.body);
    res.json(event.toJSON());
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.details ? err.details.join(' ') : err.message });
  }
});

app.delete('/api/events/:id', requireAdmin, async (req, res, next) => {
  try {
    const removed = await eventService.delete(req.params.id);
    res.json({ success: removed });
  } catch (err) {
    next(err);
  }
});

// --- Reminders API ---

app.post('/api/reminders', async (req, res) => {
  try {
    const { eventId, email, remindBefore } = req.body;
    const reminder = await reminderService.optIn(eventId, email, remindBefore);
    res.status(201).json({ success: true, reminder: reminder.toJSON() });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.details ? err.details.join(' ') : err.message });
  }
});

// --- Mail book (saved contacts) — admin only ---

function isValidEmail(email) {
  return typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email);
}

app.get('/api/contacts', requireAdmin, async (req, res, next) => {
  try {
    res.json(await contacts.findAll());
  } catch (err) {
    next(err);
  }
});

app.post('/api/contacts', requireAdmin, async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const label = (req.body.label || '').trim();
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'A valid email address is required.' });
    }
    const contact = await contacts.create(email, label);
    res.status(201).json({ success: true, contact });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'That email is already in the mail book.' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/contacts/:id', requireAdmin, async (req, res, next) => {
  try {
    const removed = await contacts.delete(req.params.id);
    res.json({ success: removed });
  } catch (err) {
    next(err);
  }
});

// --- Share calendar poster by email — admin only ---

app.post('/api/share-poster', requireAdmin, async (req, res) => {
  try {
    const { recipients, subject, text, imageDataUrl } = req.body;
    const cleanRecipients = Array.isArray(recipients) ? recipients.map((e) => String(e).trim()).filter(isValidEmail) : [];
    if (cleanRecipients.length === 0) {
      return res.status(400).json({ success: false, message: 'Add at least one valid recipient email address.' });
    }
    await sendPosterEmail({
      recipients: cleanRecipients,
      subject: subject || `${config.deptShort} Department Calendar`,
      text: text || `Attached is the ${config.deptShort} department calendar, sent from the department calendar app.`,
      imageDataUrl
    });
    res.json({ success: true, sentTo: cleanRecipients });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// --- 404 + error handling ---
// (No separate 404.ejs — the project only needs index.ejs and login.ejs,
// so this stays a plain text response instead of its own template.)

app.use((req, res) => res.status(404).send('Page not found.'));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error.' });
});

// --- Startup ---

async function seedEvents() {
  const existing = await events.findAll();
  if (existing.length === 0) {
    for (const data of SEED_EVENTS) {
      await events.create(new Event(data));
    }
  }
}

async function start() {
  await initDatabase();
  await seedEvents();
  await authService.init();

  app.listen(config.port, () => {
    console.log(`${config.instituteName} — ${config.deptName}`);
    console.log(`Calendar running at http://localhost:${config.port}`);
    console.log(`Connected to MySQL database "${config.db.database}" on ${config.db.host}:${config.db.port}`);
    console.log('Demo admin login: admin / admin123');
  });
}

start().catch((err) => {
  console.error('Failed to start the app:', err.message);
  console.error('Check your DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME settings (see .env).');
  process.exit(1);
});
