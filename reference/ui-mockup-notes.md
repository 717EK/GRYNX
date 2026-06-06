# GRYNX — Notes captured from V1 mockups

Screens reviewed and the data details they revealed. **Mockup data is sample data** —
flag which items are real so I model them correctly.

## Screens seen
1. **Admin Home** — 4 big nav rows: CREATE JOB `[02]`, JOB STATUS `[03]`, DEPARTMENTS `[01]`, MAINTENANCE `[01]`. Footer stat strip: TOTAL/IN PROGRESS/COMPLETED/ALERTS. ✅ matches spec.
2. **PIN Login** — GRYNX wordmark + tagline, "WELCOME <NAME>", 6-digit PIN boxes, ENTER, FORGOT PIN. ✅ confirms PIN auth (D4).
3. **Admin Overview (dashboard)** — KPI row (Active 23 / Completed Today 17 / Delayed 04 / Alerts 07) + panels: Job Pipeline, Department Health, Production Jobs Overview, Bottlenecks, Recent Activity, Alerts & Attention.
4. **Create Job** — Job ID auto-shown with hint, Product dropdown, Models & Qty table, Priority toggle, Pipeline (N steps), Schedule (start/target), CREATE JOB → generates job sheet w/ barcode.
5. **PPC Request Review** — PR-0001, same fields read-only-ish, APPROVE & CREATE JOB / **RC** (red). ✅ matches §PPC workflow.

## Data details revealed (confirm real vs. placeholder)
- **MNTR** is annotated **"(Marking / Drilling etc)"** → update glossary. Not "monitor".
- **Department heads (sample):** Design=Aashish, Purchase=Vikram, Laser/Cutting=Javed, MS Production=Nilesh, Alloy Production=Manoj, CNC/VMC=Pratik, MNTR=Deepak, Powder Coat=Sachin, FG Stock=Anand. → Are these the real heads to seed?
- **Model codes:** AT290 / AT400 / AT500 (not the earlier GTX example). → Confirm the real model naming convention per product.
- **Alloy Truss default pipeline (from breadcrumb):** DESIGN → PURCHASE → LASER → CUTTING → ALLOY PRODUCTION → CNC → VMC → MNTR → POWDER COAT → FG STOCK. → Is Laser/Cutting one department or two steps? Is CNC/VMC one or two? Mockup shows them split in the breadcrumb but as single departments in Dept Health. **Need the canonical pipeline per product.**
- **Bottlenecks/Alerts** surfaced: Laser waiting, CNC/VMC waiting, Powder Coat waiting, Purchase approval pending, Design drawings pending, machine maintenance due, FG stock shortage. → Good KPI signals for the dashboard spec.
- Job ID `AT-U-045-060626-001` with hint `[AT][U][045][060626][001]` ✅ matches; **display-label approach (D9) still applies** (qty `045` embedded).

## Open questions for owner
- [ ] Are the dept-head names real (seed them) or placeholders?
- [ ] Real model-code scheme per product?
- [ ] Canonical default pipeline for each of the 7 products (esp. Laser vs Laser+Cutting, CNC vs CNC+VMC granularity)?
- [ ] DELAY/ALERT status colors?
- [ ] Confirm display + mono fonts.
