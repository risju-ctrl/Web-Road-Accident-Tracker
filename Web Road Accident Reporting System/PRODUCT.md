# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Public reporters** — members of the public who submit a road accident report (details, GPS/manual location, photos) and track its status.
- **Administrators** — review and validate reports, assign officers, manage categories/users, audit activity, export data, read analytics.
- **Traffic officers** — verify accident information, work assigned reports, update investigation/response status, add official findings.

Role values in code: `reporter`, `admin`, `traffic_officer`.

## Product Purpose

A web and mobile road accident reporting system (IT 305 course project, work period Oct 12–30 2026, submission Nov 2 2026). The public can file and follow reports; officials can review, verify, assign, investigate, and report on them. Success is a working end-to-end demo over a real API + MySQL database.

## Positioning

A **public-submitted report is not an officially verified accident record** — the system must clearly distinguish them in the data model, workflow, permissions, dashboards, exports, and UI labels. This distinction is a hard constraint from the official assignment.

## Operating Context

- React + Vite client (`client/`), Express REST API (`/api/v1`), MySQL; single repo with Node backend.
- Location/map work uses OpenStreetMap + Leaflet; routing uses OpenStreetMap Valhalla; emergency contacts dial the Philippine national emergency number 911 (PNP, BFP, EMS, NDRRMC, PCG, PAGASA).
- Notifications are in-app (list + bell); email/push are stretch goals.
- Evidence (photos) is fetched through the authenticated API with blob responses, never public URLs.
- Demo is run locally (XAMPP MySQL + Node), with an optional mock mode for the admin dashboard (`VITE_USE_MOCK_DASHBOARD`).

## Capabilities and Constraints

- Auth with role-based authorization; business rules (status transitions, permissions, validation) live only on the server.
- Report statuses: submitted, under_review, needs_clarification, verified, assigned, in_progress, resolved, rejected.
- Report severities: fatal, major, moderate, minor, unknown.
- Features in scope of current work: dashboard (per-role), reports list with status filter + CSV export, report form/detail, operations map, notifications list with unread filter and pagination, admin analytics dashboard, officer reports, admin users/audit logs.
- Both dark and light themes are supported through shared design tokens in `client/src/index.css`.

## Brand Commitments

- Product name shown in the UI: **Road Accident Reporting**.
- Visual constraint from the user: the Dashboard, Reports, Notifications and Report detail surfaces should be redesigned in the language of the existing operations map (and real-world similar sites), and must not read as generic/AI-generated work.

## Evidence on Hand

- `IT 305 - PROJECT 3.pdf` (official assignment), `Project_Planning_Workbook_Road_Accident_Reporting_System.md`, `OpenCode_Master_Prompt_Road_Accident_Reporting_System.md`.
- Seed data in `database/seed.sql`; sample uploads in `uploads/`.
- No customer/testimonial/press material exists; nothing of that kind may be invented.

## Product Principles

1. Public submissions and official verified records stay visibly distinct everywhere.
2. Server is the single source of truth for rules; the UI never fakes authority it does not have.
3. The map tab is the product's operational anchor — other screens should feel like the same command-centre system.
4. Numbers must be explainable (counting rules shown with analytics).
5. Keep it demonstrable within a student project's timeline: no unbuildable scope.

## Accessibility & Inclusion

No formal standard was established. Existing conventions to preserve: keyboard focus-visible outlines, `aria-expanded`/`aria-pressed` on toggles, `prefers-reduced-motion` respected for animations, status/severity never conveyed by colour alone.
