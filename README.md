# VIT CSE (AI) Department Event Calendar

A simple full-stack event calendar for the Department of Computer Science and
Engineering (Artificial Intelligence), Vishwakarma Institute of Technology.

Built with **Node.js, Express, EJS, and MySQL**. Kept deliberately small —
one backend file, two view files, one stylesheet, one script.

## Features

- Public calendar — browse by month, filter by category (workshop, seminar,
  fest, exam, holiday), click any date to see event details.
- Email reminders — anyone can opt in to a reminder for a specific event.
- Admin login — add, edit, and delete events.
- **Calendar poster** — download a PNG "poster" calendar for a full year, a
  semester (Odd: Jul–Dec / Even: Jan–Jun), or a custom date range (admin
  only), with an event list alongside the month grid.
- **Share by email** (admin only) — send the poster as a PNG attachment to
  one or more recipients, with a shared "mail book" of saved addresses.

## Project structure

```
simplified/
├── client/
│   ├── views/
│   │   ├── index.ejs      # the entire app UI (calendar, panel, modals)
│   │   └── login.ejs      # admin login modal (included into index.ejs)
│   └── public/
│       ├── style.css
│       ├── script.js
│       ├── logo.jpg
│       └── html2canvas.min.js   # vendored locally (not loaded from a CDN)
├── server/
│   └── server.js          # config, DB, models, routes — everything backend
├── database.sql           # full schema, for reference / manual setup
├── package.json
├── .env                   # your local settings (not committed to git)
└── .gitignore
```

## Requirements

- Node.js 18+
- MySQL or MariaDB server running locally (or reachable over the network)

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create the database** (the app also auto-creates tables on first run,
   but you need the database itself to exist first):
   ```sql
   CREATE DATABASE vit_cse_ai_calendar;
   ```
   Or just run `database.sql` directly if you prefer to see the schema.

3. **Configure `.env`** — copy the values below and fill in your own:
   ```dotenv
   PORT=3000
   SESSION_SECRET=change-me-to-something-random

   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your-mysql-password
   DB_NAME=vit_cse_ai_calendar

   # Optional — only needed for the admin "Share by mail" feature.
   # Leave blank to disable; sending will show a clear error until set.
   MAIL_HOST=
   MAIL_PORT=587
   MAIL_SECURE=false
   MAIL_USER=
   MAIL_PASS=
   MAIL_FROM=VIT CSE (AI) Department Calendar <no-reply@example.com>
   ```

4. **Run it**
   ```bash
   npm start
   ```
   Visit **http://localhost:3000**.

On first run the app automatically creates all tables, seeds a few sample
events, and creates a demo admin account.

## Admin login

```
Username: admin
Password: admin123
```

Change this in production by updating the `admins` table directly (the
password is hashed with `crypto.scrypt`, so there's no plain-text version
to edit — easiest is to delete the row and let the app reseed a new one
with a different password by changing it in `server.js`'s `authService.init()`
before first run, or add your own admin-management route later).

## Setting up email sending (optional)

The "Share by mail" feature needs real SMTP credentials. The simplest free
option is Gmail:

1. Turn on **2-Step Verification**: https://myaccount.google.com/security
2. Create an **App Password**: https://myaccount.google.com/apppasswords
3. Fill in `.env`:
   ```dotenv
   MAIL_HOST=smtp.gmail.com
   MAIL_PORT=587
   MAIL_SECURE=false
   MAIL_USER=youraddress@gmail.com
   MAIL_PASS=your16characterapppassword
   MAIL_FROM=VIT CSE (AI) Department Calendar <youraddress@gmail.com>
   ```
4. Restart the server (`.env` is only read on startup).

`MAIL_PASS` must be the 16-character **app password**, not your normal
Gmail password — Google blocks regular passwords for this. `MAIL_FROM`'s
email must match `MAIL_USER`, or Gmail will reject the send.

Any other SMTP provider (Brevo, SendGrid, Outlook, your college's own mail
server) works the same way — just change `MAIL_HOST`/`MAIL_USER`/`MAIL_PASS`
to match their settings.

## Database schema

Four tables, all created automatically on startup (`database.sql` is kept
for reference / manual setup):

| Table | Purpose |
|---|---|
| `events` | Calendar events (title, date, time, venue, description, category) |
| `admins` | Admin login accounts |
| `reminders` | Emails that opted in to a reminder for a specific event |
| `contacts` | The shared "mail book" of saved recipient addresses |

## Notes

- `node_modules/` and `.env` are git-ignored — never commit real credentials.
- The Google Fonts import in `style.css` requires internet access; if it's
  blocked (e.g. a restrictive campus network), the page falls back to the
  system font and still works fine.
- `html2canvas` (used to generate the poster PNG in-browser) is vendored
  locally in `client/public/` instead of loaded from a CDN, so the poster/
  download/share features keep working even on networks that block
  third-party CDNs.
