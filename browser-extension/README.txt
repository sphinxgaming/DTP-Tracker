DTP SERVICENOW VALIDATION HELPER

Purpose
-------
This Chrome/Edge extension lets the hosted DTP Tracker validate visible rows
using the designer's existing signed-in FTI ServiceNow browser session.

It is read-only. It does not bypass login, does not store a ServiceNow password,
and does not write anything to ServiceNow.

Install in Chrome
-----------------
1. Extract DTP-ServiceNow-Helper.zip to a permanent folder.
2. Open chrome://extensions
3. Turn on Developer mode.
4. Select Load unpacked.
5. Choose the extracted browser-extension folder.

Install in Edge
---------------
Use edge://extensions, enable Developer mode, then Load unpacked.

Use
---
1. Sign in normally at https://fticonsulting.service-now.com/
2. Open https://dtp-web-tracker-y2fl.onrender.com/
3. Apply the tracker From/To/Search/Category filters.
4. Select Validate ServiceNow.

The helper opens a dedicated ServiceNow tab, searches each unique visible
Request #, reads Graphic Design Category, Number Of Slides, and the signed-in
designer's Production time rows, then closes the helper tab.

If ServiceNow asks for login, sign in in the opened tab and run validation again.

Company rollout
---------------
For company-managed browsers, IT can distribute this unpacked extension through
Chrome/Edge enterprise extension policy. No OAuth application is required.
