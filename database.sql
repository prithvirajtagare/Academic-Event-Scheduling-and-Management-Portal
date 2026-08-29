-- VIT CSE (AI) Department Event Calendar — full schema.
-- server.js also creates these tables automatically on startup
-- (CREATE TABLE IF NOT EXISTS), so running this file by hand is optional —
-- it's here for reference and for anyone setting up the DB manually.

CREATE DATABASE IF NOT EXISTS vit_cse_ai_calendar;
USE vit_cse_ai_calendar;

CREATE TABLE IF NOT EXISTS admins (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  salt          VARCHAR(255) NOT NULL,
  UNIQUE KEY uq_admins_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reminders (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  event_id      INT NOT NULL,
  user_email    VARCHAR(255) NOT NULL,
  remind_before VARCHAR(50) DEFAULT '1 day',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_reminders_event (event_id),
  CONSTRAINT fk_reminders_event FOREIGN KEY (event_id)
    REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- "Mail book" of saved recipient addresses for the admin "share calendar
-- by email" feature. Shared across any admin who logs in.
CREATE TABLE IF NOT EXISTS contacts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  label       VARCHAR(100) DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_contacts_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Demo admin account (admin / admin123) is seeded automatically by
-- server.js on first run — not inserted here since the password must be
-- hashed with Node's crypto.scrypt, which SQL can't do.

-- Sample events (optional — server.js also seeds these on an empty table):
-- INSERT INTO events (title, date, time, venue, description, category, created_by, created_at) VALUES
-- ('Orientation Day', '2026-08-04', '9:00 am', 'Main auditorium', 'Welcome session for new students joining the department this year.', 'workshop', 'admin', '2026-08-01 00:00:00'),
-- ('Tech Talk: AI', '2026-08-12', '2:00 pm', 'Seminar hall B', 'Guest lecture on recent advances in applied machine learning, open to all years.', 'seminar', 'admin', '2026-08-01 00:00:00'),
-- ('Coding Fest', '2026-08-20', '10:00 am', 'CS block lawn', 'Three-day inter-college coding competition begins.', 'fest', 'admin', '2026-08-01 00:00:00'),
-- ('Faculty Meet', '2026-08-27', '11:00 am', 'Conference room', 'Monthly faculty coordination meeting for the department.', 'workshop', 'admin', '2026-08-01 00:00:00');
