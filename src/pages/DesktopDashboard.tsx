import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts'
import { getAdminStats, type AdminStats } from '../lib/api'

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

function Kpi({ label, value, tone, sub }: { label: string; value: number | string; tone?: 'brand' | 'alert' | 'ok'; sub?: string }) {
  return (
    <div className={`dkb__kpi ${tone ? 'dkb__kpi--' + tone : ''}`}>
      <span className="dkb__kpi-v">{value}</span>
      <span className="dkb__kpi-k">{label}</span>
      {sub && <span className="dkb__kpi-sub">{sub}</span>}
    </div>
  )
}

export default function DesktopDashboard({ onOpenBoard }: { onOpenBoard: () => void }) {
  const [s, setS] = useState<AdminStats | null>(null)
  useEffect(() => {
    const tick = () => getAdminStats().then(setS).catch(() => {})
    tick()
    const h = setInterval(tick, 30_000) // live control centre
    return () => clearInterval(h)
  }, [])

  if (!s) return <div className="dk__empty">Loading control centre…</div>
  const k = s.kpis
  const totalActive = k.active || 1

  return (
    <div className="dkb">
      <div className="dk__toolbar">
        <h1 className="dk__h1">Control Centre</h1>
        <span className="dk__sub">live · updates every 30s</span>
        <button className="dk__chip" style={{ marginLeft: 'auto' }} onClick={onOpenBoard}>Open full job board ›</button>
      </div>

      {/* KPI row — most important, glanceable */}
      <div className="dkb__kpis">
        <Kpi label="Active jobs" value={k.active} tone="brand" sub={`${k.unitsWip} units in WIP`} />
        <Kpi label="In Production" value={k.inProduction} />
        <Kpi label="In QC" value={k.inQc} />
        <Kpi label="In FG Stock" value={k.inFg} />
        <Kpi label="Closure pending" value={k.closureRequested} tone={k.closureRequested > 0 ? 'alert' : undefined} />
        <Kpi label="Open tickets" value={k.openTickets} tone={k.openTickets > 0 ? 'alert' : undefined} />
      </div>

      {/* charts */}
      <div className="dkb__grid">
        <div className="dkb__card dkb__card--wide">
          <h3 className="dkb__h3">Throughput — created vs closed (14 days)</h3>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={s.throughput} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BRAND} stopOpacity={0.35} /><stop offset="100%" stopColor={BRAND} stopOpacity={0} /></linearGradient>
                <linearGradient id="gX" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GREEN} stopOpacity={0.3} /><stop offset="100%" stopColor={GREEN} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#888' }} interval={1} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} allowDecimals={false} width={34} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="created" name="Created" stroke={BRAND} strokeWidth={2} fill="url(#gC)" />
              <Area type="monotone" dataKey="closed" name="Closed" stroke={GREEN} strokeWidth={2} fill="url(#gX)" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="dkb__legend"><span><i style={{ background: BRAND }} />Created</span><span><i style={{ background: GREEN }} />Closed</span></div>
        </div>

        <div className="dkb__card">
          <h3 className="dkb__h3">Job status mix</h3>
          <div className="dkb__donut">
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie data={s.statusMix} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2} strokeWidth={0}>
                  {s.statusMix.map((d) => <Cell key={d.status} fill={STATUS_COLOR[d.status] ?? '#ccc'} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v, n) => [v, STATUS_LABEL[n as string] ?? n]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="dkb__donut-c"><b>{totalActive}</b><span>active</span></div>
          </div>
          <div className="dkb__chips">
            {s.statusMix.slice(0, 6).map((d) => (
              <span key={d.status} className="dkb__chip2"><i style={{ background: STATUS_COLOR[d.status] ?? '#ccc' }} />{STATUS_LABEL[d.status] ?? d.status} <b>{d.count}</b></span>
            ))}
          </div>
        </div>

        <div className="dkb__card">
          <h3 className="dkb__h3">Jobs by product</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={s.byProduct} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
              <XAxis dataKey="code" tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#888' }} axisLine={false} tickLine={false} allowDecimals={false} width={34} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v, _n, p) => [v, (p?.payload?.product) || 'Jobs']} />
              <Bar dataKey="count" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={42} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="dkb__card">
          <h3 className="dkb__h3">Maintenance</h3>
          {s.maintenance.length === 0 ? (
            <div className="dk__empty" style={{ padding: 24 }}>No tickets.</div>
          ) : (
            <div className="dkb__bars">
              {s.maintenance.map((m) => {
                const max = Math.max(...s.maintenance.map((x) => x.count), 1)
                return (
                  <div key={m.status} className="dkb__barrow">
                    <span className="dkb__barlabel">{MAINT_LABEL[m.status] ?? m.status}</span>
                    <span className="dkb__bartrack"><span className="dkb__barfill" style={{ width: `${(m.count / max) * 100}%`, background: MAINT_COLOR[m.status] ?? '#ccc' }} /></span>
                    <span className="dkb__barval">{m.count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
