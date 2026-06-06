# GRYNX — Permissions Matrix (V1)

Enforced **server-side** on every route; client mirrors it to hide controls.
Roles: **Admin**, **PPC**, **Dept Head** (incl. backup), **QC**, **FG Stock**,
**Maintenance**. A user may hold several roles (D8). "Own dept" = a department
the user is head/backup of.

| Action | Admin | PPC | Dept Head | QC | FG Stock | Maint |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|
| Create user / assign roles | ✅ | — | — | — | — | — |
| Manage products/models/pipelines | ✅ | — | — | — | — | — |
| Create PPC request | — | ✅ | — | — | — | — |
| Edit PPC request (draft/clarification) | — | ✅ (own) | — | — | — | — |
| Submit / cancel PPC request (pre-approval) | — | ✅ (own) | — | — | — | — |
| Request clarification (RC) | ✅ | — | — | — | — | — |
| Approve PPC → create job | ✅ | — | — | — | — | — |
| Create job directly | ✅ | — | — | — | — | — |
| Edit job priority/schedule | ✅ | — | — | — | — | — |
| Edit job qty/models (pre-acceptance) | ✅ | — | — | — | — | — |
| Cancel job | ✅ | — | — | — | — | — |
| Accept / complete current step | — | — | ✅ (own) | ✅ (QC step) | — | — |
| Hold / resume current step | — | — | ✅ (own) | ✅ (QC step) | — | — |
| Add note / image / update | — | — | ✅ (own) | ✅ | — | — |
| Request production update | ✅ | — | — | — | — | — |
| Reply to update request | — | — | ✅ (own) | ✅ | — | — |
| QC approve / send rework | — | — | — | ✅ | — | — |
| Create rework job | ✅ | — | ✅ (own) | ✅ | — | — |
| Split job | — | ✅ | — | — | — | — |
| Request closure | — | — | — | — | ✅ | — |
| Approve closure / close job | ✅ | — | — | — | — | — |
| View all jobs / timelines | ✅ | ✅ (own requests + status) | own-dept queue | QC + upstream | FG queue | — |
| Dashboard / reports / export | ✅ | partial | own-dept | QC | FG | maint |
| Create/manage maintenance ticket | ✅ | any user can *report* | report | report | report | ✅ full |
| Assign/close maintenance | ✅ | — | — | — | — | ✅ (head) |
| Receive notifications | escalations | own approvals | ✅ (heads+backups) | ✅ | ✅ | ✅ |

**Notes**
- *Any authenticated user may **report** a maintenance issue*; only Maintenance/Admin manage the ticket lifecycle.
- Notifications go to **department heads + backups** (D5); Admin only on escalation (unaccepted past SLA → backup → Admin).
- "Own dept" scoping is enforced by `role_assignments.department_id`.
- Multiple Admins are equal (D7); any Admin can approve/close.
