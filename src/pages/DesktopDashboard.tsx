import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts'
import { getAdminStats, type AdminStats, type AttentionItem } from '../lib/api'

const BRAND = '#f5a623'
const GREEN = '#2e9e5b'
const STATUS_LABEL: Record<string, string> = {
  approved: 'Approved', in_production: 'In Production', in_qc: 'In QC', in_fg: 'In FG Stock',
  close_requested: 'Closure Req.', closed: 'Closed', cancelled: 'Cancelled', draft: 'Draft', pending_approval: 'Pending',
}
const STATUS_COLOR: Record<string, string> = {
  approved: '#7c83ff', in_production: BRAND, in_qc: '#23b5b5', in_fg: '#3ecf8e',
  close_requested: '#e6962b', closed: '#2e9e5b', cancelled: '#e5392e', draft: '#9aa0a6', pending_approval: '#b9760f',
}
const MAINT_LABEL: Record<string, string> = { open: 'Open', assigned: 'Assigned', in_progress: 'In Progress', completed: 'Completed', closed: 'Closed', verified: 'Verified' }
const MAINT_COLOR: Record<string, string> = { open: '#e5392e', assigned: BRAND, in_progress: '#23b5b5', completed: '#3ecf8e', closed: '#9aa0a6', verified: '#2e9e5b' }

function Kpi({ label, value, tone, sub, onClick }: { label: string; value: number | string; tone?: 'brand' | 'alert'; sub?: string; onClick?: () => void }) {
  return (
    <button className={`dkb__kpi ${tone ? 'dkb__kpi--' + tone : ''}`} onClick={onClick} disabled={!onClick}>
      <span className="dkb__kpi-v">{value}</span>
      <span className="dkb__kpi-k">{label}</span>
      {sub && <span className="dkb__kpi-sub">{sub}</span>}
    </button>
  )
}

function Bars({ data, colorOf }: { data: { label: string; count: number }[]; colorOf: (k: string) => string }) {
  const max = Math.max(...data.map((x) => x.count), 1)
  return (
    <div className="dkb__bars">
      {data.map((m) => (
        <div key={m.label} className="dkb__barrow">
          <span className="dkb__barlabel" title={m.label}>{m.label}</span>
          <span className="dkb__bartrack"><span className="dkb__barfill" style={{ width: `${(m.count / max) * 100}%`, background: colorOf(m.label) }} /></span>
          <span className="dkb__barval">{m.count}</span>
        </div>
      ))}
    </div>
  )
}

export default function DesktopDashboard({
  onFilter, onOpenItem, onMaint,
}: {
  onFilter: (status: string) => void
  onOpenItem: (i: AttentionItem) => void
  onMaint: () => void
}) {
  const [s, setS] = useState<AdminStats | null>(null)
  useEffect(() => {
    const tick = () => getAdminStats().then(setS).catch(() => {})
    tick()
    const h = setInterval(tick, 30_000)
    return () => clearInterval(h)
  }, [])

  if (!s) return <div className="dk__empty">Loading control centre…</div>
  const k = s.kpis
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.mode !== 'light'
  const axis = dark ? '#9aa0a6' : '#888'
  const grid = dark ? '#2a2a2c' : '#eee'
  const tip = { fontSize: 12, borderRadius: 8, background: dark ? '#18181b' : '#fff', border: `1px solid ${grid}`, color: dark ? '#eee' : '#111' }

  return (
    <div className="dkb">
      <div className="dk__toolbar">
        <h1 className="dk__h1">Control Centre</h1>
        <span className="dk__sub">live · updates every 30s</span>
        <button className="dk__chip" style={{ marginLeft: 'auto' }} onClick={() => onFilter('all')}>Open full job board ›</button>
      </div>

      <div className="dkb__kpis">
        <Kpi label="Active jobs" value={k.active} tone="brand" sub={`${k.unitsWip} units in WIP`} onClick={() => onFilter('active')} />
        <Kpi label="In Production" value={k.inProduction} onClick={() => onFilter('in_production')} />
        <Kpi label="In QC" value={k.inQc} onClick={() => onFilter('in_qc')} />
        <Kpi label="In FG Stock" value={k.inFg} onClick={() => onFilter('in_fg')} />
        <Kpi label="Closure pending" value={k.closureRequested} tone={k.closureRequested > 0 ? 'alert' : undefined} onClick={() => onFilter('close_requested')} />
        <Kpi label="Open tickets" value={k.openTickets} tone={k.openTickets > 0 ? 'alert' : undefined} onClick={onMaint} />
      </div>

      <div className="dkb__grid">
        <div className="dkb__card dkb__card--wide">
          <h3 className="dkb__h3">Throughput — created vs closed (14 days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={s.throughput} margin={{ top: 6, right: 10, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BRAND} stopOpacity={0.35} /><stop offset="100%" stopColor={BRAND} stopOpacity={0} /></linearGradient>
                <linearGradient id="gX" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GREEN} stopOpacity={0.3} /><stop offset="100%" stopColor={GREEN} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: axis }} interval={1} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: axis }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip contentStyle={tip} />
              <Area type="monotone" dataKey="created" name="Created" stroke={BRAND} strokeWidth={2} fill="url(#gC)" />
              <Area type="monotone" dataKey="closed" name="Closed" stroke={GREEN} strokeWidth={2} fill="url(#gX)" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="dkb__legend"><span><i style={{ background: BRAND }} />Created</span><span><i style={{ background: GREEN }} />Closed</span></div>
        </div>

        <div className="dkb__card">
          <h3 className="dkb__h3">Job status mix</h3>
          <div className="dkb__donut">
            <ResponsiveContainer width="100%" height={186}>
              <PieChart>
                <Pie data={s.statusMix} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2} strokeWidth={0} onClick={(_d: unknown, i: number) => { const st = s.statusMix[i]?.status; if (st) onFilter(st) }} style={{ cursor: 'pointer' }}>
                  {s.statusMix.map((d) => <Cell key={d.status} fill={STATUS_COLOR[d.status] ?? '#ccc'} />)}
                </Pie>
                <Tooltip contentStyle={tip} formatter={(v, n) => [v, STATUS_LABEL[n as string] ?? n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="dkb__donut-c"><b>{k.active}</b><span>active</span></div>
          </div>
          <div className="dkb__chips">
            {s.statusMix.slice(0, 6).map((d) => (
              <button key={d.status} className="dkb__chip2" onClick={() => onFilter(d.status)}><i style={{ background: STATUS_COLOR[d.status] ?? '#ccc' }} />{STATUS_LABEL[d.status] ?? d.status} <b>{d.count}</b></button>
            ))}
          </div>
        </div>

        <div className="dkb__card">
          <h3 className="dkb__h3">Department load <small>(jobs at station now)</small></h3>
          {s.byDepartment.length === 0 ? <div className="dk__empty" style={{ padding: 20 }}>No jobs at stations.</div> : <Bars data={s.byDepartment.map((d) => ({ label: d.department, count: d.count }))} colorOf={() => BRAND} />}
        </div>

        <div className="dkb__card">
          <h3 className="dkb__h3">Jobs by product</h3>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={s.byProduct} margin={{ top: 6, right: 10, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis dataKey="code" tick={{ fontSize: 10, fill: axis }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: axis }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
              <Tooltip contentStyle={tip} cursor={{ fill: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }} formatter={(v, _n, p) => [v, (p?.payload?.product) || 'Jobs']} />
              <Bar dataKey="count" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="dkb__card">
          <h3 className="dkb__h3">Maintenance</h3>
          {s.maintenance.length === 0 ? <div className="dk__empty" style={{ padding: 20 }}>No tickets.</div> : <Bars data={s.maintenance.map((m) => ({ label: MAINT_LABEL[m.status] ?? m.status, count: m.count }))} colorOf={(l) => MAINT_COLOR[Object.keys(MAINT_LABEL).find((k2) => MAINT_LABEL[k2] === l) ?? ''] ?? BRAND} />}
        </div>

        {/* attention — exceptions that need an admin */}
        <div className="dkb__card dkb__card--wide">
          <h3 className="dkb__h3">Needs attention <small>{s.attention.length ? `· ${s.attention.length}` : ''}</small></h3>
          {s.attention.length === 0 ? (
            <div className="dk__empty" style={{ padding: 18 }}>✓ Nothing needs your attention.</div>
          ) : (
            <div className="dkb__attn">
              {s.attention.map((a) => (
                <button key={a.kind + a.id} className={`dkb__attn-row dkb__attn-row--${a.kind}`} onClick={() => onOpenItem(a)}>
                  <span className="dkb__attn-ico">{a.kind === 'ticket' ? '⚠' : '◳'}</span>
                  <span className="dkb__attn-main"><b>{a.label}</b><span>{a.sub}</span></span>
                  <span className="dkb__attn-go">›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
