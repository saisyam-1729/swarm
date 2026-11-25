> **Archived copy.** Originally written on the local branch `ui/polish-theme-layout` (tip `2b89ce0`), which was not pushed
> to this repository. Commit IDs below refer to that branch. Kept here for history; see
> [`../WORKLOG_AND_HANDOVER.md`](../WORKLOG_AND_HANDOVER.md) for how this relates to the current `main`.

# UI / UX changes — `ui/polish-theme-layout`

This file records every change on the `ui/polish-theme-layout` branch, so anyone can review it
or undo any part later. It covers **frontend only**: this branch changes no backend code and does
not change `frontend/src/services/api.js`, so the endpoints and request payloads the app sends
are unchanged.

- **Base:** `main` at `d18a083` ("Add configuration-driven IoT device provisioning")
- **Scope:** `frontend/index.html`, `frontend/src/**`, and this document
- **Rule followed:** visual changes only, unless a behaviour change was explicitly approved.
  Every approved behaviour change is listed in [Behaviour changes](#behaviour-changes) and tagged
  in the code with a `UX-CHANGE UX-nn` comment.

Find all tagged spots:

```bash
git grep -n "UX-CHANGE"            # all of them
git grep -n "UX-CHANGE UX-05"      # one change
```

---

## Commits (oldest first)

| # | Commit | Title | What it contains |
|---|--------|-------|------------------|
| 1 | `5d51f8b` | Polish frontend UI: theme, navigation shells, dashboard and overview | Visual only |
| 2 | `3758763` | Replace browser alert/confirm dialogs and restyle secondary pages | Visual restyle **+ UX-01, UX-02** |
| 3 | `8923f05` | Login: clear stale banner on submit, drop hard-coded LAN IP | **UX-03, UX-04** |
| 4 | `89b32d5` | Shared plant picker, live-data freshness, and honest feedback | **UX-05 … UX-11** |
| 5 | `d6b3f20` | Field Devices: restore original All plants default | Undoes UX-05 on Field Devices only |
| 6 | (this commit) | Document UI/UX changes and tag behaviour changes | This file + `UX-CHANGE` comments (comments only) |

---

## How to revert

### Everything on this branch

Simplest: don't merge the branch. If it is already merged, revert **newest first**. Later
commits build on earlier ones (shared components, the feedback provider), so reverting out of
order will conflict.

```bash
git revert <docs-commit> d6b3f20 89b32d5 8923f05 3758763 5d51f8b
```

Or restore the frontend wholesale to `main`'s version:

```bash
git checkout d18a083 -- frontend/index.html frontend/src
# then delete the files this branch added (see "New files" below)
```

### One commit at a time

| To undo | Command | Notes |
|---------|---------|-------|
| Shared plant picker, freshness, feedback (UX-05…UX-11) | `git revert d6b3f20 89b32d5` | Revert `d6b3f20` first; it edits the same lines. |
| Login fixes (UX-03, UX-04) | `git revert 8923f05` | Self-contained. |
| In-app dialogs + page restyle (UX-01, UX-02) | revert `89b32d5` and `d6b3f20` first, then `git revert 3758763` | `89b32d5` uses `FeedbackContext` from this commit. |
| Theme, layouts, Dashboard/Overview polish | revert everything above first, then `git revert 5d51f8b` | `StatCard` / `SectionHeader` from this commit are used by later commits. |

### One behaviour change only

Use the per-change notes in [Behaviour changes](#behaviour-changes). Each code location has a
`UX-CHANGE UX-nn` comment that quotes or describes the original code. After reverting, delete
that comment.

---

## Visual-only changes (no behaviour change)

These change how things look, not what they do. The same data is loaded, from the same
endpoints, and the same actions run.

**Commit 1 — `5d51f8b`**
- `frontend/src/theme.js`: Inter font, card borders and shadows, table header style,
  inputs/buttons/chips/tabs/menus/dialogs/tooltips, softer text colours, amber warning colour.
- `frontend/index.html`: also loads the **Inter** font from Google Fonts (Roboto was already
  loaded from there; Roboto stays as the fallback).
- `components/layout/MainLayout.jsx`, `components/control-center/ControlCenterLayout.jsx`:
  tinted selected menu item with an accent bar, top-bar divider, user card at the bottom of the
  sidebar. The Control Center drawer shows the logo on mobile like the plant app. Shared styles
  are in the new `components/layout/navStyles.js`.
- `pages/Dashboard.jsx`: KPI row uses the new `StatCard` (icons, equal heights), section titles
  use the new `SectionHeader`, icon badges on sensor tiles, tidier alert list.
- `pages/control-center/Overview.jsx`: tiles with icons, hover state, 4 columns on large screens.

**Commit 2 — `3758763` (visual part)**
- Alerts: header row, tabs inside the card, severity colour edge on rows, empty state.
- Analytics: filters in a toolbar card; Latest/Average/Min/Max cards **computed in the browser
  from the readings the page already loaded**; chart styling.
- Maintenance: summary cards computed from the loaded list.
- Reports: empty state, type/format chips, centred spinner.
- Field Devices (`pages/Sensors.jsx`): summary cards (instruments, live, stale, hubs) computed
  from the loaded lists.
- Four-card rows go 2×2 below the `lg` breakpoint so labels fit.

**Commit 4 — `89b32d5` (visual part)**
- Dashboard sensor tiles go 3 per row below `lg` (was 4 at `md`).

---

## Behaviour changes

Each of these was explicitly approved. They are listed so they can be reverted individually.

### UX-01 — In-app confirmation dialog instead of `window.confirm`
- **Commit:** `3758763`
- **Before → after:** browser OK/Cancel pop-up → in-app dialog (red for destructive actions).
  The outcome is the same: Cancel does nothing, Confirm runs the same action.
- **Files (9 sites):** `pages/Partners.jsx`, `pages/Plants.jsx` (2), `pages/Sensors.jsx`,
  `pages/control-center/Approvals.jsx` (2), `pages/control-center/Companies.jsx`,
  `pages/control-center/CompanyDetail.jsx`, `pages/control-center/DeviceDetail.jsx`.
- **Shared code:** `context/FeedbackContext.jsx` (new), wired in `main.jsx` as `<FeedbackProvider>`.
- **Revert:** at each `UX-CHANGE UX-01` comment, replace the `await confirm({...})` line with the
  original quoted in the comment and remove the `useFeedback` import/hook if it is no longer
  used. If UX-01, UX-02, UX-09 and UX-10 are all reverted, also remove `FeedbackProvider` from
  `main.jsx` and delete `context/FeedbackContext.jsx`.

### UX-02 — Toast messages instead of `window.alert`
- **Commit:** `3758763`
- **Before → after:** blocking browser alert → toast that disappears on its own. Same text.
- **Files:** `pages/Dashboard.jsx` (hub sync messages, copy IP), `pages/PlantHmi.jsx`
  (HMI command errors, 2 sites).
- **Extra:** copying a device IP now shows a "Copied …" toast; originally it was silent, and the
  fallback was `window.alert(ip)`.
- **Revert:** replace each `notify(...)` at a `UX-CHANGE UX-02` comment with the quoted original.

### UX-03 — Login: clear the previous success banner on submit
- **Commit:** `8923f05` — `pages/Login.jsx` (`handleLogin`, `handleForgot`)
- **Before → after:** after sign-up, the green "Registration received" banner stayed on screen
  next to any login error → it is cleared each time Sign In / Reset is pressed.
- **Revert:** delete the `setSuccess('');` line under each `UX-CHANGE UX-03` comment.

### UX-04 — Login: LAN hint without a hard-coded IP
- **Commit:** `8923f05` — `pages/Login.jsx`
- **Before → after:** the dev-only hint named `http://192.168.29.22:3000` → it shows
  `VITE_LAN_URL` if set, otherwise points to the "Network:" URL printed by `npm run dev`.
  It still only appears in dev mode on localhost.
- **Revert:** restore the original sentence quoted at `UX-CHANGE UX-04`.

### UX-05 — One shared plant for the plant app (top-bar picker)
- **Commit:** `89b32d5` (Field Devices part undone again in `d6b3f20`)
- **Before → after:** each page loaded `/plants` itself, had its own plant dropdown and started on
  the first plant → one picker in the top bar; the choice is shared by all plant pages and saved
  per user in `localStorage` (`swarm.selectedPlant.<userId>`).
- **Pages that follow the picker:** Dashboard, Plant HMI, Analytics, Alerts, AI Recommendations,
  Maintenance, Reports. Their own plant dropdowns were removed.
- **Not affected:** Field Devices (`pages/Sensors.jsx`) behaves exactly as on `main`: its own
  dropdown, defaulting to **All plants**. The top-bar picker is hidden there.
- **Kept behaviour:** pages given an explicit `fixedPlantId` prop still use it; Plant HMI
  `?plantId=` links still select that plant; after pairing a hub, the paired plant is selected
  (the `sessionStorage` key `dashboardPlantId` is still honoured via `adoptPairedPlant()`).
- **Side effect:** `MainLayout` no longer calls `/plants` on its own to decide whether to show
  the Plant HMI menu item; it reuses the shared list, so there is one fewer request.
- **New files:** `context/PlantContext.jsx`.
- **Revert:** this touches 8 files, so `git revert d6b3f20 89b32d5` is the practical route
  (it also reverts UX-06…UX-11). To revert by hand: in `MainLayout.jsx`, remove `PlantProvider`,
  `TopBarPlantPicker` and `PLANT_SCOPED_PATHS`, and restore the `plantAPI.getAll()` effect for
  `hmiAllowed`; then in each page tagged `UX-CHANGE UX-05`, restore the original state, effect
  and dropdown from `git show 8923f05:frontend/src/pages/<Page>.jsx`.

### UX-06 — Plant HMI explains when the selected plant has no HMI
- **Commit:** `89b32d5` — `pages/PlantHmi.jsx`
- **Before → after:** silently showed the first HMI-enabled plant → says HMI is not enabled for
  the selected plant and offers buttons to switch to plants that have it.
- **Revert:** part of UX-05 (the page no longer keeps its own plant list).

### UX-07 — Dashboard data-freshness indicator
- **Commit:** `89b32d5` — `pages/Dashboard.jsx`, new `components/common/FreshnessIndicator.jsx`,
  new `utils/time.js`
- **Before → after:** no indication of data age → header pill: "Live · updated 8s ago",
  "No new readings · last 21 min ago" (no reading for over 10 minutes), or "Connection lost ·
  last update …" (refresh failing). Sensor tiles show "x min ago" and mark stale values.
- **Extra request:** the Dashboard now also calls `GET /sensor-nodes/plant/{id}` (read-only, an
  existing endpoint) on each 10-second refresh, to get each sensor's `lastReadingAt`.
- **Also:** switching plant clears the previous plant's figures immediately (originally they
  stayed visible until the new data arrived).
- **Revert:** at the `UX-CHANGE UX-07` comments, remove the `sensorAPI.getByPlant` block, the
  reset block, and `<FreshnessIndicator …/>`; remove the tile "x min ago" caption; delete the two
  new files if nothing else uses them (`utils/time.js` is also used by Alerts, UX-08).

### UX-08 — Relative times
- **Commit:** `89b32d5` — `pages/Alerts.jsx` (time column), `pages/Dashboard.jsx`
  (paired devices "Last Reading")
- **Before → after:** full date/time → "3 min ago", with the full date/time on hover.
- **Revert:** replace with the original quoted at each `UX-CHANGE UX-08` comment.

### UX-09 — Reports: Download disabled; Generate gives feedback
- **Commit:** `89b32d5` — `pages/Reports.jsx`
- **Why:** in the backend, `ReportService.generateReport` only stores a record with a made-up
  `filePath`; no PDF/Excel/CSV is produced and there is no download endpoint. The original
  Download button was clickable but had no action.
- **Before → after:** enabled Download that did nothing → disabled, with a tooltip explaining.
  Generate: no message, errors unhandled → success/error toast.
- **Revert:** restore the original button quoted at `UX-CHANGE UX-09`, and change
  `handleGenerate` back to `await reportAPI.generate(...); setDialogOpen(false); loadReports(...)`.

### UX-10 — Alerts: feedback on Acknowledge / Resolve
- **Commit:** `89b32d5` — `pages/Alerts.jsx` (`runAlertAction`)
- **Before → after:** no confirmation, failures silent → success toast, error toast on failure,
  buttons disabled while the request runs. The API calls are the same.
- **Revert:** restore the two original handlers quoted at `UX-CHANGE UX-10` and remove `busyId`.

### UX-11 — Plain-language errors and Retry
- **Commit:** `89b32d5`
- **Before → after:** raw server text (e.g. "Internal server error") → plain-language messages
  from `friendlyErrorMessage()` in `utils/networkError.js`. 4xx messages from the server are
  still shown. Alerts and Analytics error states get a **Retry** button
  (`components/common/EmptyState.jsx` now accepts an optional `action`).
- **Used in:** `pages/Alerts.jsx`, `pages/Analytics.jsx`, `pages/Reports.jsx`.
- **Revert:** replace `friendlyErrorMessage(err, '…')` with the original message expressions
  (see `git show 8923f05:frontend/src/pages/<Page>.jsx`) and remove the `action={…Retry…}` props.

---

## New files

| File | Added in | Used by |
|------|----------|---------|
| `frontend/src/components/common/StatCard.jsx` | `5d51f8b` | Dashboard, Analytics, Maintenance, Field Devices |
| `frontend/src/components/common/SectionHeader.jsx` | `5d51f8b` | Dashboard, Analytics |
| `frontend/src/components/layout/navStyles.js` | `5d51f8b` | MainLayout, ControlCenterLayout |
| `frontend/src/context/FeedbackContext.jsx` | `3758763` | UX-01, UX-02, UX-09, UX-10 |
| `frontend/src/context/PlantContext.jsx` | `89b32d5` | UX-05, UX-06 |
| `frontend/src/components/common/FreshnessIndicator.jsx` | `89b32d5` | UX-07 |
| `frontend/src/utils/time.js` | `89b32d5` | UX-07, UX-08 |
| `docs/changes/UI_UX_CHANGES.md` | this commit | — |

---

## Known gaps (not changed)

- **Report files are never generated** (backend stub); real export needs backend work.
- **No "Undo" for Acknowledge/Resolve:** the backend has no endpoint to move an alert back to Active.
- **Bell badge count** in the top bar still refreshes every 60 s, as before.
- **Not tested:** the `fixedPlantId` embedded mode (no page in the app currently uses it), and
  the phone layout of commit 4.

## How it was verified

Run locally (TimescaleDB in Docker, backend on `:8081`, Vite on `:3000`) as the demo Super Admin
and the Control Center admin. Checked in the browser: every restyled page, confirm dialog
Cancel/Confirm paths, toasts, plant switching across pages and reloads, Plant HMI with and
without HMI, freshness states (live, stale, and a simulated connection loss), Reports
Generate/Download, Alerts Acknowledge, and Field Devices defaulting to All plants. `vite build`
passes after every commit.

## Related backend branches (separate, not part of this branch)

Real bug fixes, kept apart so they can be reviewed and deployed on their own. Each has its own
note under `docs/changes/` on its branch.

- `fix/sensor-reading-sql-spacing` (`ec5ea4f`): fixes `WHERECOALESCE` SQL that broke Analytics and
  the Dashboard's latest readings.
- `fix/sensor-reading-save` (`46c64f0`): fixes the `SensorReading` id mapping that made every
  sensor reading fail to save. **Ingest needs both fixes** (the ingest flow also runs the queries
  fixed by the SQL branch).
