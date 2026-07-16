# DTP Web Tracker

This is a local web-based replacement for the Excel/VBA DTP tracker. It keeps the same core flow:

- enter a job line and start review time
- start a work countdown from the time budget
- pause/resume work
- park an unfinished job, handle an urgent QC job, then continue the original row
- start/stop break tracking or add a planned DXB break window
- end the job and calculate worked hours minus break time
- import old CSV/Excel rows that use the standard timesheet columns
- generate a Word timesheet from the visible filtered rows
- show all official tracker times in Dubai time (`Asia/Dubai`, UTC+4)

The Word export uses `public/timesheet-template.docx` as the base template, so the official logo/footer/signature layout stays with the generated file.

Time budget input treats whole numbers as minutes (`10` = 10 minutes, `190` = 190 minutes). Decimal values are hours (`1.5`, `1.25`, `2.0`, `3.0`).

## Login And Admin

The tracker has built-in accounts:

- first launch shows a one-time `Create first admin` screen
- first-admin setup requires the private setup code
- the first admin receives/protects any existing tracker rows
- admins can add designer accounts from the `Admin` button in the header
- each designer sees only their own tracker rows and timer state
- new designer accounts start blank

Keep the setup code and first admin password private. If this is deployed on Render, create the first admin immediately after the deploy finishes. For production/internal rollout, set `ADMIN_SETUP_CODE` in Render to your own private code.

## ServiceNow Validation

The `Validate ServiceNow` button validates only the rows currently visible after Search/From/To/Category filters. Because the team can only use the ServiceNow portal, this runs as a guided portal queue instead of an API integration.

The queue copies/opens each visible `Request #` one by one. Enter the ServiceNow portal values for `Graphic Design Category`, `Number Of Slides`, and Bryan `Production time (in mins)`. The tracker updates `Category of work` only; slide and minute differences are shown as mismatch notes and are not auto-changed.

A deployed website cannot click or read a separate logged-in ServiceNow Chrome tab, and ServiceNow stays read-only.

## Run Locally With Installed Node

```powershell
cd "C:\Users\logap\Documents\Codex\2026-05-09\files-mentioned-by-the-user-dtp\dtp-web-tracker"
npm start
```

Then open:

```text
http://localhost:4173
```

Or double-click:

```text
Start DTP Tracker.cmd
```

For company laptops where designers cannot install Node.js, use the no-install zip package. It includes `runtime\node.exe`, so they only extract and double-click `Start DTP Tracker.cmd`.

## Data

Rows and timer state are stored locally in:

```text
data/tracker.json
```

Back up that file regularly if you want to keep history.

## Sharing With Designers

For individual tracking, each designer should receive their own copy of the folder and run it locally. Do not include your `data/tracker.json` when sending the folder unless you intentionally want to share your rows.

See `LOCAL-INSTALL.md` for designer setup steps.

## GitHub / Render Deployment

This app can be deployed from GitHub as a Node web service. It is not suitable for GitHub Pages because it needs a server process and writable data storage.

See `DEPLOY_GITHUB.md` for the upload and Render setup steps.
