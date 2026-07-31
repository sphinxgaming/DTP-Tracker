# ServiceNow Validation

The tracker supports two read-only validation modes. Neither mode requires
Codex and neither mode writes anything to ServiceNow.

## No-OAuth export validation

This mode is available without IT API credentials:

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
2. `Validate ServiceNow` sends only the visible tracker row IDs to the backend.
3. The backend groups repeated rows by Request #.
4. Tracker slides and worked minutes are totaled for each request.
5. ServiceNow category, slides, and the current designer's production minutes
   are read and compared.
6. Category of work is updated when ServiceNow has a clear value.
7. Slide and minute mismatches are reported but never auto-edited.

The tracker never writes to ServiceNow.
