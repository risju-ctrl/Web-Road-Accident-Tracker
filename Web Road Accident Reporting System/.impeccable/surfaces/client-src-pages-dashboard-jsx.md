---
version: 1
slug: "client-src-pages-dashboard-jsx"
primary_target: "client/src/pages/Dashboard.jsx"
related_targets: ["client/src/pages/ReportsList.jsx","client/src/pages/Notifications.jsx","client/src/pages/ReportDetail.jsx","client/src/pages/AdminDashboard.jsx"]
---

# Ops tabs — Dashboard, Reports, Notifications, Report detail

Scope: rebuild the four non-map tabs plus the admin analytics console in the operations map's visual language. Mode: Operate. Primary target: `client/src/pages/Dashboard.jsx`.

## Audience and job

Reporters, traffic officers, and admins returning to the app to read the situation, work their lists, and open one report's full record. Task-first screens; the map tab is the product's anchor and defines the house grammar.

## Must keep working

All current functionality: status filter + CSV export on Reports; unread toggle, pagination, mark-read and mark-all on Notifications; status/assign/findings actions on Report detail; evidence upload/view through the authed API; edit links; admin dashboard filters, charts, mock mode.

## Constraints

Existing tokens serve dark and light themes. No new dependencies. Navbar and routes unchanged. Container width stays; the ops frame lives inside it.

## Direction contract

**THESIS:** the map's command-centre grammar becomes the house language for every tab — a live situation strip and frosted stat panels instead of the generic card-and-table admin template.

**OWN-WORLD:** dark-first surface tokens; frosted panels (translucent surface-1, blur, inset top highlight, hairline border) floating over a faint accent/violet glow; uppercase tracked eyebrow titles; monospace report references; the severity/status ramp as the only saturated colour.

**STORY:** the visitor reads one line of operational status, scans the stat row, then works the list — the same reading order and components as the map sidebar.

**FIRST VIEWPORT:** on each tab: situation strip (dot + counts + time-ago), eyebrow + title header with its primary action, a dense stat row, then the work panel (list/table/history) in a frosted panel.

**FORM:** extension of the established ops world; the surface round recorded below rolled this screen's composition. seed:ba64e58e7287d9e6

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Memorable moment

The situation strip: every tab opens with the map's one-line operational readout, so switching tabs feels like panning the same console rather than loading another page.

## Admin console — pipeline board composition (round 2026-10-17)

The console's composition was rolled on a surface round (seed:ba64e58e7287d9e6) and locked to the dealt lead, **The Pipeline Board**, under the user's confirmed answers: keep the app's design system and re-compose, success = "how bad is it, where, and what needs me" in seconds. The pinned ops grammar above stays binding; the roll only set composition.

**THESIS:** the eight-stage report lifecycle is the console's spine — a full-width stage rail with counts and share, every scoped widget answering to the selected stage — instead of the category-default KPI-strip-over-chart-grid.

**FIRST VIEWPORT (console):** situation strip (pending, over-7-days waiting, fatalities); eyebrow + title header with the filter row; compact five-reading KPI strip with YoY; full-width stage rail (Submitted → Rejected, Needs Info flagged, one stage selected); map left + accident-type/injury panels right, scoped to the selected stage; needs-attention queue beginning above the fold with an over-7-days alert. Selecting a stage scopes only the map pins and the queue (client-side); the scope line names it, and counts never change with selection.

**Raised disciplines (named donors):** pin-to-row registration and "the filter layer never edits the base counts" (orienteering map); one question per panel with one number, waiting read as durations (terminal wayfinding); stage weight by extent with the selected stage extending (acetate tab board); rejected stays visible as the cancelled stage (jet-age ticket wallet); one hairline registration grid behind every panel edge (design annual plate section); rank carried by scale, colour only by meaning (variable font specimen).

**FORM:** pipeline-led funnel board, position 5 of the grounded list (dealt lead). seed:ba64e58e7287d9e6

## Unresolved decisions

None — the direction is pinned by the user's brief ("like the UI of the map, not AI-generated"), and the console's pipeline composition was locked unattended after the decision page went unanswered (built as the roll's assigned lead; the page stayed open for a pivot that never landed).
