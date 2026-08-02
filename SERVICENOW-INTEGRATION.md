# ServiceNow Validation

The tracker supports three read-only validation modes. None requires Codex and
none writes anything to ServiceNow.

## Automatic browser-helper validation (no OAuth)

This is the recommended mode when FTI does not provide API credentials:

1. Download `DTP-ServiceNow-Helper.zip` from the validation window.
2. Extract it, open `chrome://extensions` or `edge://extensions`, enable
   Developer mode, and choose `Load unpacked`.
3. Select the extracted `browser-extension` folder.
4. Sign in normally to the FTI ServiceNow portal.
5. Apply the From/To/Search/Category filters in DTP Tracker and select
   `Validate ServiceNow`.

The extension opens a dedicated ServiceNow tab, searches Closed DTP Requests
one Request # at a time, opens the matching record, and reads:

- `Graphic Design Category`
- `Number Of Slides`
- DTP Time Reporting `Production`
- `Production time (in mins)`

It uses the selected tracker account's ServiceNow Production display name.
Only the final request/category/slides/minutes comparison values are returned
to DTP Tracker. ServiceNow cookies, credentials, and browser-session data never
leave the browser.

This is not an authentication bypass. If ServiceNow requests login, the helper
brings that tab forward so the designer can sign in normally and retry.

For a team-wide managed-browser rollout, FTI IT can distribute the same
Manifest V3 extension through Chrome or Edge enterprise extension policy.

## Manual supplied-data fallback

This fallback is available only when the user's ServiceNow role can copy or
export the permitted list data:

1. Apply the From/To/Search/Category filters in the tracker.
2. In the user's normal signed-in ServiceNow session, export the Closed DTP
   Requests list with `Number`, `Graphic Design Category`, and
   `Number Of Slides`.
3. To compare worked minutes, also export DTP Time Reportings with the parent
   DTP Request, `Production`, and `Production time (in mins)` columns.
4. Select `Validate ServiceNow`, upload the CSV/Excel/TSV/HTML export files,
   and select `Validate visible from export`.

The tracker groups the currently visible rows by Request #, fills Category of
work only when the exported category is unambiguous, and reports slide/minute
mismatches without changing those values. Production minutes are filtered to
the selected designer's ServiceNow production name.

This is not an authentication bypass. The designer exports only data that their
normal ServiceNow account is already permitted to view. The tracker receives no
ServiceNow password, OAuth token, cookie, or browser session.

## Optional automatic API validation

The fully automatic mode runs from the Render backend. It does not require a
ServiceNow browser tab or any software on a designer's computer, but it does
require company-approved read-only API access.

## Required FTI setup for automatic API mode

Ask the ServiceNow administrator to create a server-to-server OAuth client with
an application user that has read-only access to:

- the Closed DTP Request table (`u_dtp_request` by default)
- `number`
- `u_graphic_design_category`
- `u_number_of_slides`
- the DTP Time Reporting table
- the reporting parent/request reference field
- `u_production`
- `u_production_time_in_mins`

The integration account must not have create, update, or delete permission on
those tables. The tracker only sends GET requests to ServiceNow.

## Render environment variables

Set these in the existing Render service. Secrets must never be committed to
GitHub.

```text
SERVICENOW_INSTANCE_URL=https://fticonsulting.service-now.com
SERVICENOW_REQUEST_TABLE=u_dtp_request
SERVICENOW_NUMBER_FIELD=number
SERVICENOW_CATEGORY_FIELD=u_graphic_design_category
SERVICENOW_SLIDES_FIELD=u_number_of_slides

SERVICENOW_OAUTH_GRANT_TYPE=client_credentials
SERVICENOW_OAUTH_TOKEN_URL=https://fticonsulting.service-now.com/oauth_token.do
SERVICENOW_OAUTH_CLIENT_ID=<provided by FTI ServiceNow admin>
SERVICENOW_OAUTH_CLIENT_SECRET=<provided by FTI ServiceNow admin>
SERVICENOW_OAUTH_SCOPE=<optional scope provided by FTI ServiceNow admin>

SERVICENOW_REPORTING_TABLE=<internal DTP Time Reporting table name>
SERVICENOW_REPORTING_PARENT_FIELD=<field linking a reporting row to the request>
SERVICENOW_REPORTING_PARENT_MODE=sys_id
SERVICENOW_REPORTING_PRODUCTION_FIELD=u_production
SERVICENOW_REPORTING_MINUTES_FIELD=u_production_time_in_mins
```

Static bearer tokens and a read-only username/password remain supported as
fallbacks, but OAuth client credentials are the intended team deployment.

## Designer mapping

Each DTP Tracker account has a `ServiceNow production name`. An admin sets this
to the exact display name shown in the DTP Time Reporting `Production` field.
This lets the same hosted tracker validate minutes for designers in any country
without hard-coding one person's name.

## Automatic API validation behavior

1. The designer selects a From/To range and any other tracker filters.
2. `Validate ServiceNow` first shows the visible row/request counts and active filters. `Cancel` stops without opening ServiceNow; only explicit confirmation starts validation.
3. The confirmed visible tracker row IDs are sent to the backend.
4. The backend groups repeated rows by Request #.
5. Tracker slides and worked minutes are totaled for each request.
6. ServiceNow category, slides, and the current designer's production minutes
   are read and compared.
7. Category of work is updated when ServiceNow has a clear value.
8. Slides are reported but never auto-edited. Worked minutes are shown in a dedicated manual-review form with tracker and ServiceNow values side by side, the calculated difference, a reviewer decision, and notes. Neither value is auto-edited.
9. The manual minutes comparison can be downloaded as CSV for follow-up or audit.

The tracker never writes to ServiceNow.
