# UI behaviour fixes on top of `feature/mqtt-device-ops-and-ui`

- **Branch:** `ui/behaviour-fixes-on-mqtt`
- **Base:** `origin/feature/mqtt-device-ops-and-ui` at `bf891ab` ("Add MQTT resilience, device
  lifecycle ops, and UI refresh"), which builds on `main` at `d18a083`.
- **Scope:** frontend only. No backend changes, no changes to `services/api.js`, and no visual
  restyling: the base branch's design system (AppChrome, light/dark mode, components) is
  untouched.
- **Origin:** these fixes were first built and tested on `ui/polish-theme-layout` (based on
  `main`), then re-applied here because the base branch replaced most of that UI.

Every behaviour change is tagged in the code with a `UX-CHANGE UX-nn` comment that quotes or
describes the original code:

```bash
git grep -n "UX-CHANGE"
```

## Changes

| ID | Change | Files | Revert |
|----|--------|-------|--------|
| UX-01 | In-app confirmation dialog instead of `window.confirm` (12 sites). **The original sentence is shown word for word** as the dialog message; only a short title and a specific button label (e.g. "Revoke key") are added. Destructive actions use a red button. Cancel does nothing; Confirm runs the same action as before. | `pages/Partners.jsx`, `pages/Plants.jsx` (2), `pages/Sensors.jsx`, `pages/control-center/Approvals.jsx` (2), `Companies.jsx`, `CompanyDetail.jsx`, `DeviceDetail.jsx` (4: rotate secret, lifecycle, revoke, reassign) | Replace each `await confirm({...})` with the original quoted in its `UX-CHANGE` comment. |
| UX-02 | Toast instead of `window.alert` (4 sites), same text. | `pages/Dashboard.jsx` (hub sync, 2), `pages/PlantHmi.jsx` (HMI command errors, 2) | Replace each `notify(...)` with the quoted original. |
| UX-03 | Login: the sign-up "Registration received" banner is cleared when Sign In / Reset is pressed, so it no longer shows next to a login error. | `pages/Login.jsx` | Delete the `setSuccess('')` lines under the `UX-CHANGE UX-03` comments. |
| UX-09 | Reports: Download is disabled with an explanation (the backend never generates a file and has no download endpoint; the button had no action). Generate shows a success or error toast (it previously had no message and no error handling). | `pages/Reports.jsx` | Restore the button and `handleGenerate` as described in the comments. |
| UX-10 | Alerts: Acknowledge / Resolve show a success or error toast and are disabled while the request runs. The API calls are unchanged. | `pages/Alerts.jsx` | Restore the two original handlers quoted in the comment; remove `busyId`. |

**Shared code:** `context/FeedbackContext.jsx` (new; `confirm()` returns a Promise<boolean>, and
`notify(message, severity)`), mounted in `main.jsx` inside `ColorModeProvider`, so dialogs and
toasts follow light/dark mode. If UX-01, UX-02, UX-09 and UX-10 are all reverted, remove
`FeedbackProvider` from `main.jsx` and delete the file.

**Error text:** failure toasts reuse each page's existing message expression
(`err.response?.data?.message || '<fallback>'`). Error wording was deliberately not changed.

## Not ported (by decision)

From the earlier branch, these were left out to keep this change small: plain-language error
wording (UX-11), the Dashboard live/stale pill (UX-07) and the shared plant picker (UX-05/06).
UX-04 (LAN IP) and UX-08 (relative times) are already handled by the base branch. The earlier
backend fixes are already in the base branch too (it has its own `SensorReadingMappingTest`
and `SensorReadingSqlAssemblyTest`).

## Verified locally

Backend and frontend run from this branch (Flyway applied the base branch's `V3`). Checked in
the browser:
- Login: banner cleared on submit.
- Reports: Download disabled; Generate toast, and the list grew.
- Alerts: Acknowledge button disabled while running, success toast, and the alert left Active.
- Plants: delete dialog in light and dark mode; Cancel deletes nothing.

`vite build` passes. Not clicked through individually: the four Control Center device dialogs
(the same component and pattern as the others).

## Revert all

```bash
git revert <this commit>
```
