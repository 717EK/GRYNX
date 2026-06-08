import QRCode from 'qrcode'
import bwipjs from 'bwip-js/node'

// The job card is a self-contained, print-friendly HTML page. It works even if
// the SPA is down. Both codes encode the OPAQUE jobNo (never the display label,
// per D9) so the barcode stays valid if qty/priority change.

export interface JobCardData {
  jobNo: string
  displayLabel: string
  productName: string
  priority: string
  totalQty: number
  createdAt: Date
  startDate: Date | null
  models: { code: string; name: string; size?: string | null; quantity: number }[]
  steps: { sequence: number; name: string }[]
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export async function renderJobCard(d: JobCardData): Promise<string> {
  const qrSvg = await QRCode.toString(d.jobNo, { type: 'svg', margin: 0, width: 150 })
  const barcodeSvg = bwipjs.toSVG({
    bcid: 'code128',
    text: d.jobNo,
    scale: 3,
    height: 9,
    includetext: true,
    textxalign: 'center',
  })
  const dt = (x: Date | null) => (x ? new Date(x).toLocaleDateString('en-GB') : '—')

  const modelRows = d.models
    .map((m) => `<tr><td>${esc(m.code)}</td><td>${esc(m.size ?? '—')}</td><td class="num">${m.quantity}</td></tr>`)
    .join('')
  const stepPills = d.steps
    .map((s) => `<span class="pill"><b>${s.sequence / 10}</b> ${esc(s.name)}</span>`)
    .join('<span class="arrow">→</span>')

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Job Card ${esc(d.displayLabel)}</title>
<style>
  :root { --ink:#0a0a0a; --brand:#f5a623; --line:#d9d9d9; --mut:#666; }
  * { box-sizing:border-box; }
  body { font-family:'Space Mono',ui-monospace,monospace; color:var(--ink); margin:0; padding:18px; }
  .card { max-width:760px; margin:0 auto; border:2px solid var(--ink); padding:18px 20px; }
  .top { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid var(--ink); padding-bottom:10px; }
  .brand { font-weight:700; letter-spacing:.04em; }
  .brand small { display:block; color:var(--mut); font-weight:400; letter-spacing:.18em; font-size:10px; }
  .label { font-size:30px; font-weight:700; letter-spacing:.02em; margin:14px 0 2px; }
  .sub { color:var(--mut); font-size:12px; }
  .prio { display:inline-block; padding:2px 9px; border:1.5px solid var(--ink); font-weight:700; font-size:12px; text-transform:uppercase; }
  .prio.urgent { background:var(--brand); }
  .grid { display:grid; grid-template-columns:1fr 170px; gap:18px; margin-top:14px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th,td { text-align:left; padding:5px 8px; border-bottom:1px solid var(--line); }
  th { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--mut); }
  td.num,th.num { text-align:right; }
  .codes { text-align:center; }
  .codes svg { max-width:100%; }
  .qr { width:150px; height:150px; margin:0 auto; }
  .flow { margin-top:14px; font-size:12px; line-height:2; }
  .pill { display:inline-block; padding:2px 8px; border:1px solid var(--line); border-radius:3px; }
  .pill b { color:var(--brand); }
  .arrow { color:var(--mut); margin:0 4px; }
  .foot { margin-top:14px; display:flex; justify-content:space-between; font-size:11px; color:var(--mut); border-top:1px solid var(--line); padding-top:8px; }
  .jobno { font-size:11px; letter-spacing:.1em; }
  .noprint { text-align:center; margin:14px 0; }
  button { font:inherit; padding:8px 18px; border:1.5px solid var(--ink); background:var(--brand); cursor:pointer; }
  @media print { .noprint { display:none; } body { padding:0; } .card { border:none; } }
</style></head>
<body>
  <div class="card">
    <div class="top">
      <div class="brand">D-LYFT<small>GRYNX · TRACK. SYNC. EXECUTE.</small></div>
      <div class="prio ${d.priority === 'urgent' ? 'urgent' : ''}">${esc(d.priority)}</div>
    </div>
    <div class="label">${esc(d.displayLabel)}</div>
    <div class="sub">${esc(d.productName)} · ${d.totalQty} units · created ${dt(d.createdAt)} · start ${dt(d.startDate)}</div>
    <div class="grid">
      <div>
        <table>
          <thead><tr><th>Model</th><th>Length</th><th class="num">Qty</th></tr></thead>
          <tbody>${modelRows}</tbody>
        </table>
        <div class="flow"><strong>Pipeline:</strong><br>${stepPills}</div>
      </div>
      <div class="codes">
        <div class="qr">${qrSvg}</div>
        <div style="margin-top:8px">${barcodeSvg}</div>
      </div>
    </div>
    <div class="foot"><span class="jobno">ID ${esc(d.jobNo)}</span><span>Scan on arrival at each station</span></div>
  </div>
  <div class="noprint"><button onclick="window.print()">Print job card</button></div>
</body></html>`
}
