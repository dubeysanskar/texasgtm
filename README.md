# GTM CRM

Go-to-market CRM for Taha Airwaves: lead management, bulk upload, scraping and enrichment, multilingual templates, automated email campaigns, tasks, messaging and a role-based admin panel. Interface available in English and Russian, per project.

## Requirements

- Node.js 20+
- A database — **SQLite** (zero-config, default) or **PostgreSQL** 13+

## Setup

```bash
npm install
cp .env.example .env        # fill in JWT_SECRET and SMTP (used for OTP login / invites)
node scripts/bootstrap-db.js   # creates schema, projects, super admins (+ seeds if the data files are present)
npm run dev                 # http://localhost:3000
```

### Choosing the database

| Mode | `.env` | Notes |
|------|--------|-------|
| SQLite (default) | leave `DATABASE_URL` unset, or `DATABASE_URL=sqlite:./data/gtm.db` | File lives in `./data/`. Back that folder up. |
| PostgreSQL | `DATABASE_URL=postgresql://user:pass@host:5432/dbname` | Add `DATABASE_SSL=false` for servers without TLS (localhost is detected automatically). |

The app writes Postgres-style SQL; the SQLite driver translates it on the fly, so both engines behave the same.

### Production (Ubuntu VPS, pm2 + nginx)

```bash
# one-time, if you want Postgres instead of SQLite:
bash scripts/server-setup-postgres.sh     # installs Postgres, creates db + user, prints DATABASE_URL

cd /var/www/texasgtm
git pull origin main && npm install && npm run build
node scripts/bootstrap-db.js              # idempotent
pm2 restart texasgtm
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/bootstrap-db.js` | Build a fresh database end-to-end (schema → projects → super admins → Russian project → seeds). Flags: `--no-seed`, `--send-email`. |
| `scripts/setup-russian-project.js` | Create/refresh the Russian-language project and its admins. |
| `scripts/seed-templates.js <file.md>` | Import outreach templates from the Markdown file. |
| `scripts/seed-excel.js <file.xlsx>` | Import the Russia leads spreadsheet. |
| `scripts/add-user.js "Name" email [role]` | Create or promote a user. |
| `scripts/legacy/` | Old one-off migrations, reference only. |

## Login

Super admins and managers sign in with email + a one-time code sent by email (no password). Other roles use email + password + OTP.
