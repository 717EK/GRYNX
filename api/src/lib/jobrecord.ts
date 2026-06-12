// Printable PRODUCTION RECORD — the full as-built dossier for a job: the actual
// station trail (who / in / out / dwell / ★ auto-out / remarks), QC results,
// serials and material. Printed at FG / after closure for the paper file.
// Self-contained HTML (mirrors jobcard.ts conventions).

export interface JobRecordData {
  displayLabel: string
  name: string | null
  productName: string
  priority: string
  totalQty: number
  status: string
  createdAt: Date
  completionDate: Date | null
  visits: { station: string; operator: string; inAt: Date; outAt: Date | null; outMode: string | null; remark: string | null }[]
  qc: { result: string; inspector: string; notes: string | null; at: Date }[]
  serials: string[]
  materials: { item: string; quantity: string | null; vendor: string | null; batchRef: string | null }[]
  neverScanned: string[]
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

const dt = (x: Date | null) => (x ? new Date(x).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

function dwell(inAt: Date, outAt: Date | null) {
  if (!outAt) return 'open'
  const mins = Math.max(0, Math.round((outAt.getTime() - inAt.getTime()) / 60000))
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export function renderJobRecord(d: JobRecordData): string {
  const visitRows = d.visits
    .map(
      (v) => `<tr>
        <td><b>${esc(v.station)}</b></td>
        <td>${esc(v.operator)}</td>
        <td>${dt(v.inAt)}</td>
        <td>${dt(v.outAt)}${v.outMode === 'auto' ? ' <span class="star" title="auto-closed — never scanned out">★</span>' : ''}</td>
        <td class="num">${dwell(v.inAt, v.outAt)}</td>
        <td class="mut">${esc(v.remark ?? '')}</td>
      </tr>`,
    )
    .join('')
  const qcRows = d.qc
    .map((q) => `<tr><td><b class="${q.result === 'approved' ? 'ok' : 'bad'}">${esc(q.result.toUpperCase())}</b></td><td>${esc(q.inspector)}</td><td>${dt(q.at)}</td><td class="mut">${esc(q.notes ?? '')}</td></tr>`)
    .join('')
  const matRows = d.materials
    .map((m) => `<tr><td>${esc(m.item)}</td><td>${esc(m.quantity ?? '—')}</td><td>${esc(m.vendor ?? '—')}</td><td>${esc(m.batchRef ?? '—')}</td></tr>`)
    .join('')
  const serialChips = d.serials.map((s) => `<span class="chip">${esc(s)}</span>`).join('')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Production Record ${esc(d.displayLabel)}</title>
<style>
  :root { --ink:#0a0a0a; --line:#d9d9d9; --mut:#666; }
  * { box-sizing:border-box; }
  body { font-family:"Segoe UI",system-ui,sans-serif; color:var(--ink); margin:0; padding:28px; font-size:12px; }
  h1 { font-size:22px; margin:0; letter-spacing:.01em; }
  .sub { color:var(--mut); margin:3px 0 0; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid var(--ink); padding-bottom:12px; }
  .badge { border:1.5px solid var(--ink); border-radius:6px; padding:4px 10px; font-weight:700; font-size:11px; text-transform:uppercase; }
  h2 { font-size:11px; text-transform:uppercase; letter-spacing:.12em; color:var(--mut); margin:20px 0 6px; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--mut); padding:5px 8px; border-bottom:1px solid var(--ink); }
  td { padding:6px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
  .num { text-align:right; white-space:nowrap; }
  .mut { color:var(--mut); }
  .ok { color:#2e7d32; } .bad { color:#c62828; }
  .star { color:#c62828; font-weight:700; }
  .chip { display:inline-block; border:1px solid var(--line); border-radius:5px; padding:2px 8px; margin:2px 3px 2px 0; font-family:ui-monospace,monospace; font-size:11px; }
  .warn { border:1.5px solid #c62828; color:#c62828; border-radius:6px; padding:8px 10px; margin-top:14px; font-weight:600; }
  .meta { display:flex; gap:26px; margin-top:10px; }
  .meta div b { display:block; font-size:13px; }
  .meta div span { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--mut); }
  .legend { color:var(--mut); font-size:10px; margin-top:6px; }
  @media print { body { padding:10mm; } }
</style></head><body>
  <div class="head">
    <div>
      <h1>${esc(d.name ?? d.displayLabel)}</h1>
      <p class="sub">${d.name ? esc(d.displayLabel) + ' · ' : ''}${esc(d.productName)} · ${d.totalQty} units · ${esc(d.priority)}</p>
    </div>
    <span class="badge">Production Record · ${esc(d.status)}</span>
  </div>
  <div class="meta">
    <div><b>${dt(d.createdAt)}</b><span>Created</span></div>
    <div><b>${dt(d.completionDate)}</b><span>Closed</span></div>
    <div><b>${d.visits.length}</b><span>Station visits</span></div>
    <div><b>${d.serials.length}</b><span>Serials</span></div>
  </div>

  <h2>Station Trail (as built)</h2>
  ${d.visits.length ? `<table><thead><tr><th>Station</th><th>Operator</th><th>In</th><th>Out</th><th>Dwell</th><th>Work done</th></tr></thead><tbody>${visitRows}</tbody></table>
  <p class="legend">★ = station never scanned out — time auto-closed by the system.</p>` : '<p class="mut">No station scans recorded.</p>'}
  ${d.neverScanned.length ? `<div class="warn">Never scanned at: ${d.neverScanned.map(esc).join(', ')}</div>` : ''}

  <h2>QC</h2>
  ${d.qc.length ? `<table><thead><tr><th>Result</th><th>Inspector</th><th>When</th><th>Notes</th></tr></thead><tbody>${qcRows}</tbody></table>` : '<p class="mut">No inspections recorded.</p>'}

  <h2>Serial Numbers</h2>
  ${d.serials.length ? `<div>${serialChips}</div>` : '<p class="mut">None.</p>'}

  <h2>Raw Material</h2>
  ${d.materials.length ? `<table><thead><tr><th>Item</th><th>Qty</th><th>Vendor</th><th>Batch</th></tr></thead><tbody>${matRows}</tbody></table>` : '<p class="mut">None logged.</p>'}
</body></html>`
}
