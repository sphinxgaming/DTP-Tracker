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
