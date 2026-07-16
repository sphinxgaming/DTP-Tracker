# Deploy From GitHub

This app is a Node web service. It is not a GitHub Pages static site because the tracker writes to a local JSON database.

## What To Upload

Upload the project folder contents to a private GitHub repository.

Important included files:

- `server.js`
- `package.json`
- `package-lock.json`
- `public/`
- `render.yaml`
- `Procfile`
- `data/tracker.seed.json`

Do not upload:

- `runtime/`
- `data/tracker.json`
- `data/tracker.json.bak`
- `data/recovery-backups/`

The live local data remains in `data/tracker.json`. The deploy seed is `data/tracker.seed.json`; the server copies that seed into the deployed data disk only when no deployed `tracker.json` exists yet.

## Render Deployment

1. Push the files to GitHub.
2. In Render, create a new Blueprint from the GitHub repo.
3. Render will read `render.yaml`.
4. Keep the persistent disk enabled at `/var/data`.
5. Open the deployed URL after the build finishes.
6. Log in with the Bryan admin account, then create designer accounts from the `Admin` button.

Render installs the browser PDF dependency during the build. Keep the existing Node 20 setting and the `npm install --omit=optional` build command from `render.yaml`.

The app stores deployed data in `DATA_DIR=/var/data`. Future deployed edits are saved to that disk, not to GitHub.

The first admin is bootstrapped by server configuration. If the deployed disk already has tracker rows but no users yet, those existing rows are assigned to the Bryan admin account so the data is protected instead of lost.

Set `ADMIN_BOOTSTRAP_PASSWORD` in Render before deploying a fresh service. Existing deployed services that already have users keep those users and ignore the bootstrap password.

## Updating An Existing Tracker Without Losing Rows

If your Render tracker already contains newer rows, update the files in the same GitHub repository and redeploy the same Render service.

- Keep the existing Render persistent disk attached at `/var/data`.
- Do not delete the Render service or its disk.
- Do not create a new service when you want to keep the existing online records.

`data/tracker.seed.json` is only copied when the deployed disk has no `tracker.json` yet. A redeploy on the same service will continue using the saved records already on its disk.

For this July 2026 package, `data/tracker.seed.json` was refreshed from the live tracker and includes records through July 15, 2026. Existing Render services keep using the persistent disk data at `/var/data`.

## ServiceNow Portal Validation

The `Validate ServiceNow` button uses a guided ServiceNow Portal queue. No ServiceNow API credentials are required in Render. It works on the tracker rows currently visible after filters, copies/opens each `Request #`, updates tracker `Category of work` only, and reports slide/minute mismatches without changing them.

## Hosted PPTX And Image Tools

The tracker header includes:

- `PPTX Slimmer`, which processes presentations inside the user's browser.
- `Image Extractor`, which processes uploaded files inside the browser and uses the authenticated Render backend only when scanning public website URLs.

No extra Render disk is needed for these tools, and they do not modify tracker rows.

## Privacy Note

`data/tracker.seed.json` contains the current tracker rows for first-time deployment. Keep the GitHub repo private if those records should not be visible to others. After login, each designer only sees their own rows.
