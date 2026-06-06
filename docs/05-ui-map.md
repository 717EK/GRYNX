# GRYNX — UI Map (V1)

> Branding (logos, fonts, colors, screenshots) from D-LYFT is the **source of truth**
> and will drive a theme/token layer. This map defines structure, not visuals.

## Layout system
- **Desktop/Web & iPad-landscape:** Left Nav · Main Content · Right Activity panel (per §11.2, approved).
- **iPad-portrait & Phone:** single column, bottom tab bar, Activity becomes a sheet.
- One component library; layouts adapt by breakpoint. Big touch targets on floor screens.

## Navigation by role (left nav / tab bar)
| Role | Primary destinations |
|------|----------------------|
| Admin | Dashboard · **Create Job [n]** · Jobs · Departments · Maintenance · Reports · Admin (users/catalog) |
| PPC | Dashboard · My Requests · New Request · Jobs (status view) |
| Dept Head | **My Queue** · In Progress · On Hold · History · Maintenance (report) |
| QC | QC Inbox · In Progress · History |
| FG Stock | FG Inbox · Closure Requests · History |
| Maintenance | Tickets (Open/Assigned/In-Progress) · History |

## Key screens

### Home / Dashboard (Admin)
Tiles: Active · Delayed (SLA) · On Hold · Department Load · Avg Completion. `Create Job [3]` badge = pending PPC requests. Right panel = live activity feed.

### Create Job (Admin)
Two entry modes: (a) review a pending PPC request → **Approve & Create** / **RC**; (b) direct create form: Product → Models+Qty → Priority → Pipeline (template, editable → "this job only / save for future") → dates → review → generate Job Sheet.

### PPC — New / My Requests
Form: Product · Models+Qty · Priority · Pipeline · Schedule. List shows status chips (draft/submitted/clarification/approved). Edit allowed in draft/clarification.

### Dept Head — My Queue (the most-used floor screen)
Cards sorted Urgent-first. Each card: Job label, product, qty, time waiting, **Accept** (primary). Open job → Accept/Complete/Hold buttons, note+image capture, timeline. Hold → reason picker (mandatory).

### Job Detail (all roles, scoped)
Header (label, product, qty, priority, status) · Pipeline progress bar (per-step status) · Timeline (events + images, timestamped) · Activity/notes · Job Sheet PDF / barcode / QR.

### QC Inbox
Completed jobs awaiting inspection → **Approve** (→FG) or **Send Rework** (issue + entry department, notes mandatory).

### FG Stock
Inbox of QC-approved jobs → verify received qty → **Request Closure**. Closure requests list (status).

### Maintenance
Report form (category, priority, location, description, photo). Ticket board Open→Assigned→In Progress→Completed→Verified→Closed.

### Notifications
Bell + list; deep-links to job/ticket. Floor devices: push + in-app badge.

### Admin / Settings
Users & roles (multi-dept), departments + head/backup assignment, products/models, pipeline templates, SLA/escalation thresholds.

## Cross-cutting UI
- **Barcode scan** entry on floor screens → opens Job Detail (camera in pilot; supports hardware scanners as keyboard-wedge).
- **Offline banner** when queued actions pending (D3).
- **Urgent** styling consistent everywhere (always sorts above Normal).
