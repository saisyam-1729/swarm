# Work log and handover — UI/UX improvements (Nov 2026)

One place that explains what was done on this repository, why, what is in `main` here, what was
deliberately left out, and how to run it locally. Written so anyone (including the original
repository owner) can pick it up later.

- **This repository:** `saisyam-1729/swarm` (private)
- **Upstream:** `heisenberg-i/swarm` (public)
- **Guiding rule:** UI/UX work must **not change functionality**. Visual changes are fine; any
  behaviour change needs explicit approval and is tagged in code (`UX-CHANGE UX-nn`) with a way
  to revert it.

---

## 1. What `main` in this repository contains

```
heisenberg-i/swarm main (d18a083)
  └─ heisenberg-i/swarm feature/mqtt-device-ops-and-ui (bf891ab)
       "Add MQTT resilience, device lifecycle ops, and UI refresh"   ← owner's work, unmerged upstream
         └─ a2033d5 "Port feedback fixes onto feature/mqtt-device-ops-and-ui"   ← our work
              └─ (this document)
```

So `main` here = upstream `main` + the owner's unmerged feature branch + our feedback fixes.

| Layer | What it brings | Documented in |
|-------|----------------|---------------|
| Upstream `main` | The SWARM app as published | Project `README.md`, `docs/` |
| Owner's feature branch | MQTT resilience, device lifecycle operations (suspend/retire/revoke/reassign), audit events (`V3` migration), new design system (navy/teal, Inter + IBM Plex Mono, light/dark mode, `AppChrome`, `AuthShell`, telemetry components), and **fixes for both backend bugs we found** (see §4) | Its commit message |
| Our fixes (`a2033d5`) | In-app confirm dialogs and toasts, alert action feedback, honest Reports Download/Generate, login banner fix | [`UI_BEHAVIOUR_FIXES.md`](UI_BEHAVIOUR_FIXES.md) + 22 `UX-CHANGE` tags in code |

Find every behaviour change we made:

```bash
git grep -n "UX-CHANGE"
```

---

## 2. Documents in `docs/changes/`

| File | What it is |
|------|------------|
| `WORKLOG_AND_HANDOVER.md` | This overview |
| [`UI_BEHAVIOUR_FIXES.md`](UI_BEHAVIOUR_FIXES.md) | **The changes in this `main`**: each one with before/after, files, testing, and how to revert |
| [`archive/UI_UX_CHANGES_on_main.md`](archive/UI_UX_CHANGES_on_main.md) | Full log of the first round of UI work, built on upstream `main` before we knew about the owner's branch (not in this `main`; see §3) |
| [`archive/FIX_SENSOR_READING_SQL_SPACING.md`](archive/FIX_SENSOR_READING_SQL_SPACING.md) | Our note on the `WHERECOALESCE` SQL bug (the owner's branch fixes it too) |
| [`archive/FIX_SENSOR_READING_SAVE.md`](archive/FIX_SENSOR_READING_SAVE.md) | Our note on the reading-save (composite id) bug (the owner's branch fixes it too) |

Archived files mention commit IDs from local branches that were never pushed; they are kept
for the reasoning, not as instructions for this `main`.

---

## 3. History: how we got here

1. **Cloned and ran upstream `main` locally**, then read the code (backend: Spring Boot 3 / Java
   17 / PostgreSQL + TimescaleDB; frontend: React 18 + MUI + Vite; plant app and Control Center).
2. **First UI round on upstream `main`** (local branch `ui/polish-theme-layout`, 6 commits):
   a theme and layout polish, restyled pages, and approved behaviour changes UX-01 … UX-11 (in-app
   dialogs, toasts, login fixes, shared plant picker, data-freshness pill, relative times,
   Reports Download fix, alert feedback, friendlier errors). Field Devices was later reverted to
   its original "All plants" default under the no-functionality-change rule. Full log:
   `archive/UI_UX_CHANGES_on_main.md`.
3. **Found and fixed two backend bugs on upstream `main`** (local branches, not pushed). See §4.
4. **Discovered the owner's unmerged branch** `feature/mqtt-device-ops-and-ui`. A local trial
   rebase showed 12 conflicting files: it rewrites the same screens with a full design system,
   and it already fixes both backend bugs.
5. **Decision:** build on the owner's branch, keep its design untouched, and port only the
   *feedback fixes* (approved scope). That is commit `a2033d5`, pushed here as `main`.

### Comparison: first UI round vs. the owner's branch

| Item from the first round | Owner's branch | In this `main`? |
|---------------------------|----------------|-----------------|
| Visual polish (theme, layouts, stat cards, page restyles) | Replaced by their design system | No (theirs is used) |
| UX-01/02 in-app dialogs and toasts | Missing (16 browser pop-ups) | **Yes** |
| UX-03 stale login banner | Bug still present | **Yes** |
| UX-04 hard-coded LAN IP on login | Already fixed | Theirs |
| UX-05/06 shared plant picker, HMI message | Missing | No (backlog) |
| UX-07 live/stale/connection-lost pill | Partly (relative times on sensors) | No (backlog) |
| UX-08 relative times | Mostly present | Theirs |
| UX-09 dead Reports Download | Still dead | **Yes** |
| UX-10 alert action feedback | Missing | **Yes** |
| UX-11 friendly error wording | Retry exists (`ErrorState`); about 50 raw-message sites | No (backlog) |
| Backend SQL + save fixes | Both fixed | Theirs |

---

## 4. Bugs found (backend)

Both are **fixed in this `main`** by the owner's branch. Our independent fixes and notes are
archived for reference.

| Bug | Effect | Root cause | Owner's fix |
|-----|--------|------------|-------------|
| `WHERECOALESCE` SQL | Analytics returned HTTP 500; Dashboard latest readings failed | Java text blocks drop the trailing space in `WHERE """ + PLANT_MATCH` | Leading space in `PLANT_MATCH`; `SensorReadingSqlAssemblyTest` |
| Reading save failed | **No sensor reading could be stored** (REST, ESP batch, MQTT) | `@IdClass` composite id with `@GeneratedValue(IDENTITY)`; Hibernate rejects it | `id` is the only JPA id; `SensorReadingMappingTest` |

### Other issues observed (not fixed)

- **Reports produce no files.** `ReportService.generateReport` stores a record with a made-up
  `filePath`; there is no file generation and no download endpoint. The UI now says so (UX-09).
  Real export needs backend work.
- **Dashboard health score stays empty** after new readings. It is probably computed by a
  separate scheduled job; not investigated.
- **No "undo" for alert Acknowledge/Resolve:** the backend has no endpoint to move an alert
  back to Active.
- **Top-bar bell count** refreshes only every 60 s.
- **Startup warning on upstream `main`:** "Device backfill skipped: null value in column
  tenant_id of relation devices" (`DeviceBackfillRunner`). Seen on the upstream-`main` backend;
  not re-checked on this `main`.
- **Not tested:** MQTT ingest (disabled locally), and the four Control Center device dialogs
  clicked one by one (same component as the tested dialogs).

---

## 5. Improvement backlog (suggested, not built here)

In priority order. Each would change behaviour, so each needs approval first.

1. **Shared plant picker** in the top bar, remembered across pages (Field Devices keeps "All
   plants"). Built and tested on the first-round branch; would need re-implementing in `AppChrome`.
2. **Data-freshness pill** on the Dashboard: "Live · updated 8s ago", "No new readings · last
   21 min ago", "Connection lost". Reuse the owner's `formatDistanceToNow` helper.
3. **Plain-language error messages** instead of raw server text (about 50 sites), using the
   owner's `ErrorState` for Retry.
4. **Explain the health score** (why it is empty, what lowered it).
5. **First-run checklist** for a new plant (pair hub → first reading → thresholds → invite
   operators), and a status page for sign-ups waiting for approval.
6. **Group the sidebar** (Monitor / Operate / Manage).
7. **Analytics:** threshold bands on charts, comparing two sensors, custom date range, CSV export.
8. **Phone layouts** for operators on site (stacked cards instead of wide tables; keep the
   floating NOVA button from covering content).
9. **Step-by-step hub pairing wizard.**
10. **Accessibility:** don't rely on colour alone for severity, add labels to icon-only buttons,
    keep keyboard focus inside dialogs.
11. **Backend:** real report export; a repository test against a real Postgres/TimescaleDB
    (Testcontainers), so mapping and SQL bugs are caught before deployment.

Code-quality suggestions from the review: split the oversized pages (450–530 lines) into hooks,
use one shared polling hook that pauses in hidden tabs, add frontend tests, store the login
token more safely than `localStorage`, and split the main JS bundle (Vite warns above 500 kB).

---

## 6. Running it locally (Windows)

No secrets are stored in this repository. Local values live in a file **outside** the repo
(here `C:\Users\<you>\Documents\swarm-local\local-dev.env`, not committed).

**Requirements:** Docker Desktop, Java 17 (JDK), Node.js 18+.

**1. Database (TimescaleDB on 127.0.0.1:5433)**

```bash
docker volume create swarm_local_pg
docker run -d --name swarm-local-pg -p 127.0.0.1:5433:5432 \
  -e POSTGRES_DB=swarm -e POSTGRES_USER=swarm -e POSTGRES_PASSWORD=<choose one> \
  -v swarm_local_pg:/var/lib/postgresql/data timescale/timescaledb:2.30.1-pg16
# first time only: create the four core Timescale tables
docker exec -i swarm-local-pg psql -U swarm -d swarm -v ON_ERROR_STOP=1 < database/swarm-core-init.sql
```

Later runs: `docker start swarm-local-pg`. Flyway applies the application migrations
(`V1`–`V3`) when the backend starts.

**2. Backend (http://127.0.0.1:8081/api)**: set these environment variables (values in your
local env file), then start it:

`DB_HOST=127.0.0.1`, `DB_PORT=5433`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`,
`SPRING_PROFILES_ACTIVE=dev`, `JWT_SECRET`, `SWARM_BOOTSTRAP_ADMIN_EMAIL`,
`SWARM_BOOTSTRAP_ADMIN_PASSWORD`, `SWARM_SEED_DEMO_ACCOUNTS=true`, `SWARM_SEED_DEMO_PASSWORD`,
`SWARM_SEED_PID_DEMO=true`, `MQTT_ENABLED=false`, and
`JAVA_HOME=C:\Program Files\Java\jdk-17` (the Maven wrapper fails without it).

```bash
cd backend
./mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"
```

**3. Frontend (http://localhost:3000)**: Vite proxies `/api` to port 8081.

```bash
cd frontend
npm install
npm run dev
```

**Accounts created on first start:** the Control Center admin (from
`SWARM_BOOTSTRAP_ADMIN_EMAIL`), and demo Super Admins `rebuild.demo@swarm.local` and
`abc@gmail.com` (password from `SWARM_SEED_DEMO_PASSWORD`). New sign-ups need approval in
Control Center → Approvals.

**Docker Desktop troubleshooting (seen on a Windows 11 Insider build):** startup failed with
"cannot remove …\Docker\run\dockerInference" (and then `…\docker-secrets-engine\engine.sock`).
Moving those folders aside (renaming them) and turning off Docker AI / Model Runner in Docker
settings got past those errors. Docker's Linux VM still didn't start until Docker Desktop was
fixed on the machine itself (the exact fix wasn't recorded; the usual steps are `wsl --update`,
updating Docker Desktop, restarting Windows, or switching Docker to the Hyper-V engine).

**Vite tip:** if the browser shows a blank page with "does not provide an export named
'default'" after switching branches, restart `npm run dev` (stale module cache).

---

## 7. Next steps

1. **Agree with `heisenberg-i`** how this reaches upstream. Our commit sits on top of their
   `feature/mqtt-device-ops-and-ui`, so it can be a pull request into that branch (or into
   upstream `main` once theirs is merged). `UI_BEHAVIOUR_FIXES.md` explains each change.
2. Decide which backlog items (§5) to do next; each needs approval because it changes behaviour.
3. Consider removing `docs/SWARM_Project_Workflow_and_Usage.pdf` upstream: it lists old demo
   passwords in plain text (already public in the upstream repository).
