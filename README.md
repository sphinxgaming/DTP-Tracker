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
- open the hosted PPTX Slimmer and Image Extractor from the top toolbar

The Word export uses `public/timesheet-template.docx` as the base template, so the official logo/footer/signature layout stays with the generated file.

Time budget input treats whole numbers as minutes (`10` = 10 minutes, `190` = 190 minutes). Decimal values are hours (`1.5`, `1.25`, `2.0`, `3.0`).

## Login And Admin

The tracker has built-in accounts:

- the login page only shows username/password
- a fresh install automatically creates the configured Bryan admin account
- the Bryan admin receives/protects any existing tracker rows
- admins can add designer accounts from the `Admin` button in the header
- admins can promote a designer to admin or change an admin back to designer
- admins can open a designer account from the Admin panel to view that designer's tracker rows
- each designer sees only their own tracker rows and timer state
- new designer accounts start blank

Keep the admin password private. For production/internal rollout, set `ADMIN_BOOTSTRAP_PASSWORD` in Render before deploying a fresh service. Existing deployed services that already have users keep those users and ignore the bootstrap password.

## ServiceNow Validation

The `Validate ServiceNow` button validates only the rows currently visible after Search/From/To/Category filters. Because the team can only use the ServiceNow portal, this runs as a guided portal queue instead of an API integration.

The queue copies/opens each visible `Request #` one by one. Enter the ServiceNow portal values for `Graphic Design Category`, `Number Of Slides`, and Bryan `Production time (in mins)`. The tracker updates `Category of work` only; slide and minute differences are shown as mismatch notes and are not auto-changed.

A deployed website cannot click or read a separate logged-in ServiceNow Chrome tab, and ServiceNow stays read-only.

## Built-In DTP Tools

Signed-in users can open two tools from the tracker header:

- `PPTX Slimmer` optimizes `.pptx` files in the browser. The presentation stays on the user's device and is not uploaded to the tracker server.
- `Image Extractor` scans public website URLs through the authenticated tracker server and extracts images from uploaded images, PDF, PPTX, DOCX, XLSX, ZIP, and OpenDocument files in the browser.

Website extraction requires internet access and some target sites may block automated requests. Uploaded-file extraction still works without sending the uploaded file to the tracker server.

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
