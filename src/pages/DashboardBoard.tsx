import { useEffect, useMemo, useRef, useState } from 'react'
import GridLayout, { type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import {
  getAgenda, getDaySummary, getOrders, getStock, getQcReports, getQcEscapes,
  type Agenda, type DaySummary, type Order, type StockRow, type QcReport,
} from '../lib/api'
import './DashboardBoard.css'

const STORE = 'grynx.board.v1'
type LItem = { i: string; x: number; y: number; w: number; h: number }

type Datum = { agenda: Agenda | null; summary: DaySummary | null; orders: Order[]; stock: StockRow[]; qc: QcReport[]; escapes: QcReport[] }
type Tone = 'normal' | 'warn' | 'bad' | 'good'
type Row = { label: string; sub?: string; jobId?: string }
type Source = { group: string; label: string } & (
  | { kind: 'kpi'; tone?: Tone; value: (d: Datum) => number | string }
  | { kind: 'list'; rows: (d: Datum) => Row[] }
)

const oStatus = (o: Order) => o.derivedStatus || o.status
const sum = (a: number[]) => a.reduce((s, n) => s + n, 0)

// the widget catalogue — every widget binds to data we already serve.
const REGISTRY: Record<string, Source> = {
  // ── KPIs ──
  ordersToPlan: { group: 'Orders', label: 'Orders to plan', kind: 'kpi', value: (d) => d.orders.filter((o) => ['submitted', 'planning'].includes(oStatus(o))).length },
  ordersInProd: { group: 'Orders', label: 'Orders in production', kind: 'kpi', value: (d) => d.orders.filter((o) => oStatus(o) === 'in_production').length },
  ordersReady: { group: 'Orders', label: 'Orders ready', kind: 'kpi', tone: 'good', value: (d) => d.orders.filter((o) => oStatus(o) === 'ready').length },
  urgentOrders: { group: 'Orders', label: 'Urgent orders', kind: 'kpi', tone: 'warn', value: (d) => d.agenda?.urgentOrders.length ?? 0 },
  dueToday: { group: 'Orders', label: 'Due today', kind: 'kpi', tone: 'warn', value: (d) => d.agenda?.dueOrders.length ?? 0 },
  overdue: { group: 'Floor', label: 'Overdue on floor', kind: 'kpi', tone: 'bad', value: (d) => d.agenda?.overdue.length ?? 0 },
  ppcRequests: { group: 'Decisions', label: 'PPC requests', kind: 'kpi', value: (d) => d.agenda?.decisions.ppcRequests ?? 0 },
  awaitingForward: { group: 'Decisions', label: 'Awaiting forward', kind: 'kpi', value: (d) => d.agenda?.decisions.awaitingForward ?? 0 },
  dispatchApprove: { group: 'Decisions', label: 'Dispatch to approve', kind: 'kpi', value: (d) => d.agenda?.decisions.dispatchToApprove ?? 0 },
  closures: { group: 'Decisions', label: 'Closures to sign', kind: 'kpi', value: (d) => d.agenda?.decisions.closuresToApprove ?? 0 },
  maintenance: { group: 'Decisions', label: 'Open maintenance', kind: 'kpi', value: (d) => d.agenda?.decisions.openTickets ?? 0 },
  openQc: { group: 'QC', label: 'Open QC issues', kind: 'kpi', tone: 'warn', value: (d) => d.agenda?.decisions.openQcIssues ?? 0 },
  qcHolds: { group: 'QC', label: 'QC holds to approve', kind: 'kpi', tone: 'bad', value: (d) => d.agenda?.decisions.qcHoldsToApprove ?? 0 },
  qcStale: { group: 'QC', label: 'Stale holds (>4h)', kind: 'kpi', tone: 'bad', value: (d) => d.agenda?.decisions.qcStaleHolds ?? 0 },
  qcEscapes: { group: 'QC', label: 'QC escapes', kind: 'kpi', tone: 'bad', value: (d) => d.agenda?.decisions.qcEscapes ?? 0 },
  jobsClosed: { group: 'Today', label: 'Jobs closed today', kind: 'kpi', tone: 'good', value: (d) => d.summary?.jobsClosed ?? 0 },
  jobsCreated: { group: 'Today', label: 'Jobs raised today', kind: 'kpi', value: (d) => d.summary?.jobsCreated ?? 0 },
  shippedToday: { group: 'Today', label: 'Orders shipped today', kind: 'kpi', tone: 'good', value: (d) => d.summary?.shipped ?? 0 },
  scansToday: { group: 'Today', label: 'Station scans today', kind: 'kpi', value: (d) => d.summary?.scans ?? 0 },
  fgOnHand: { group: 'Stock', label: 'FG on hand', kind: 'kpi', value: (d) => sum(d.stock.map((s) => s.onHand)) },
  fgReserved: { group: 'Stock', label: 'FG reserved', kind: 'kpi', value: (d) => sum(d.stock.map((s) => s.reserved)) },
  fgSkus: { group: 'Stock', label: 'FG SKUs', kind: 'kpi', value: (d) => d.stock.length },
  // ── lists ──
  overdueList: { group: 'Floor', label: 'Overdue jobs', kind: 'list', rows: (d) => (d.agenda?.overdue ?? []).map((o) => ({ label: o.label, sub: `${o.station} · ${o.mins}m`, jobId: o.jobId })) },
  ordersPlanList: { group: 'Orders', label: 'Orders to plan', kind: 'list', rows: (d) => d.orders.filter((o) => ['submitted', 'planning'].includes(oStatus(o))).map((o) => ({ label: o.name || o.orderNo, sub: `${o.client} · ${o.items.length} line(s)` })) },
  urgentList: { group: 'Orders', label: 'Urgent orders', kind: 'list', rows: (d) => (d.agenda?.urgentOrders ?? []).map((o) => ({ label: o.name || o.orderNo, sub: `${o.client} · ${o.status.replace(/_/g, ' ')}` })) },
  qcOpenList: { group: 'QC', label: 'Open QC reports', kind: 'list', rows: (d) => d.qc.filter((r) => r.status === 'open').map((r) => ({ label: r.job.displayLabel, sub: `${r.kind}${r.severity ? ` · ${r.severity}` : ''} · ${r.note.slice(0, 40)}`, jobId: r.jobId })) },
  qcEscapeList: { group: 'QC', label: 'QC escapes', kind: 'list', rows: (d) => d.escapes.map((r) => ({ label: r.job.displayLabel, sub: r.note.slice(0, 48), jobId: r.jobId })) },
  lowStockList: { group: 'Stock', label: 'Lowest available stock', kind: 'list', rows: (d) => [...d.stock].sort((a, b) => a.available - b.available).slice(0, 8).map((s) => ({ label: `${s.product.name}${s.model ? ` · ${s.model.name}` : ''}${s.size ? ` · ${s.size}` : ''}`, sub: `${s.available} free / ${s.onHand} on hand` })) },
}

type WidgetInst = { i: string; src: string }
const DEFAULT_WIDGETS: WidgetInst[] = [
  { i: 'w1', src: 'ordersInProd' }, { i: 'w2', src: 'overdue' }, { i: 'w3', src: 'qcEscapes' }, { i: 'w4', src: 'qcHolds' },
  { i: 'w5', src: 'jobsClosed' }, { i: 'w6', src: 'fgOnHand' }, { i: 'w7', src: 'overdueList' }, { i: 'w8', src: 'ordersPlanList' },
]
const DEFAULT_LAYOUT: LItem[] = [
  { i: 'w1', x: 0, y: 0, w: 2, h: 2 }, { i: 'w2', x: 2, y: 0, w: 2, h: 2 }, { i: 'w3', x: 4, y: 0, w: 2, h: 2 },
  { i: 'w4', x: 6, y: 0, w: 2, h: 2 }, { i: 'w5', x: 8, y: 0, w: 2, h: 2 }, { i: 'w6', x: 10, y: 0, w: 2, h: 2 },
  { i: 'w7', x: 0, y: 2, w: 4, h: 5 }, { i: 'w8', x: 4, y: 2, w: 4, h: 5 },
]

function loadBoard(): { widgets: WidgetInst[]; layout: LItem[] } {
  try { const s = JSON.parse(localStorage.getItem(STORE) || ''); if (s.widgets && s.layout) return s } catch { /* default */ }
  return { widgets: DEFAULT_WIDGETS, layout: DEFAULT_LAYOUT }
}

export default function DashboardBoard({ onOpenJob }: { onOpenJob?: (id: string) => void }) {
  const init = useMemo(loadBoard, [])
  const [widgets, setWidgets] = useState<WidgetInst[]>(init.widgets)
  const [layout, setLayout] = useState<LItem[]>(init.layout)
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [data, setData] = useState<Datum>({ agenda: null, summary: null, orders: [], stock: [], qc: [], escapes: [] })
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 1200))
    ro.observe(el); setWidth(el.clientWidth || 1200)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    Promise.allSettled([getAgenda(), getDaySummary(), getOrders(), getStock(), getQcReports({ scope: 'all', status: 'open' }), getQcEscapes()])
      .then(([a, s, o, st, q, e]) => setData({
        agenda: a.status === 'fulfilled' ? a.value : null,
        summary: s.status === 'fulfilled' ? s.value : null,
        orders: o.status === 'fulfilled' ? o.value.orders : [],
        stock: st.status === 'fulfilled' ? st.value.items : [],
        qc: q.status === 'fulfilled' ? q.value.reports : [],
        escapes: e.status === 'fulfilled' ? e.value.reports : [],
      }))
  }, [])

  function persist(w: WidgetInst[], l: LItem[]) { localStorage.setItem(STORE, JSON.stringify({ widgets: w, layout: l })) }
  function onLayoutChange(l: Layout[]) { const ll = l.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })); setLayout(ll); persist(widgets, ll) }
  function addWidget(src: string) {
    const i = 'w' + Date.now().toString(36)
    const isList = REGISTRY[src].kind === 'list'
    const nw = [...widgets, { i, src }]
    const maxY = layout.reduce((m, x) => Math.max(m, x.y + x.h), 0)
    const nl = [...layout, { i, x: 0, y: maxY, w: isList ? 4 : 2, h: isList ? 5 : 2 }]
    setWidgets(nw); setLayout(nl); persist(nw, nl); setPicking(false)
  }
  function removeWidget(i: string) {
    const nw = widgets.filter((w) => w.i !== i); const nl = layout.filter((l) => l.i !== i)
    setWidgets(nw); setLayout(nl); persist(nw, nl)
  }
  function resetBoard() { setWidgets(DEFAULT_WIDGETS); setLayout(DEFAULT_LAYOUT); persist(DEFAULT_WIDGETS, DEFAULT_LAYOUT) }

  const grouped = useMemo(() => {
    const g: Record<string, [string, Source][]> = {}
    for (const [k, s] of Object.entries(REGISTRY)) { (g[s.group] ||= []).push([k, s]) }
    return g
  }, [])

  return (
    <section className="dw__view">
      <div className="dw__toolbar">
        <h1 className="dw__h1">Board</h1>
        <span className="dw__sub">{editing ? 'arrange · resize · add or remove widgets' : 'your composed dashboard'}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {editing && <button className="ord__btn ord__btn--ghost" onClick={() => setPicking((p) => !p)}>＋ Add widget</button>}
          {editing && <button className="ord__btn ord__btn--ghost" onClick={resetBoard}>Reset</button>}
          <button className={`ord__btn ${editing ? 'ord__btn--solid' : ''}`} onClick={() => { setEditing((e) => !e); setPicking(false) }}>{editing ? '✓ Done' : '✎ Edit board'}</button>
        </div>
      </div>

      {picking && (
        <div className="wbd__picker">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="wbd__pgroup">
              <span className="wbd__pgtitle">{group}</span>
              {items.map(([k, s]) => <button key={k} className="wbd__pitem" onClick={() => addWidget(k)}>{s.kind === 'kpi' ? '▦' : '☰'} {s.label}</button>)}
            </div>
          ))}
        </div>
      )}

      <div ref={wrapRef}>
      <GridLayout className="wbd" width={width} layout={layout} cols={12} rowHeight={64} margin={[12, 12]} isDraggable={editing} isResizable={editing} onLayoutChange={onLayoutChange} draggableHandle=".wbw__grip" compactType="vertical">
        {widgets.map((w) => {
          const s = REGISTRY[w.src]
          if (!s) return <div key={w.i} className="wbw"><div className="wbw__missing">unknown widget</div></div>
          return (
            <div key={w.i} className={`wbw ${editing ? 'wbw--edit' : ''}`}>
              <div className="wbw__head">
                {editing && <span className="wbw__grip" title="Drag">⠿</span>}
                <span className="wbw__title">{s.label}</span>
                {editing && <button className="wbw__x" onClick={() => removeWidget(w.i)}>×</button>}
              </div>
              <div className="wbw__body">
                {s.kind === 'kpi' ? (
                  <div className={`wbw__kpi wbw__kpi--${(s.tone ?? 'normal')} ${Number(s.value(data)) > 0 && (s.tone === 'bad' || s.tone === 'warn') ? 'is-on' : ''}`}>
                    <span className="wbw__n">{s.value(data)}</span>
                  </div>
                ) : (
                  <ul className="wbw__list">
                    {s.rows(data).length === 0 ? <li className="wbw__empty">Nothing here.</li> : s.rows(data).slice(0, 12).map((r, idx) => (
                      <li key={idx} className={r.jobId && onOpenJob ? 'is-link' : ''} onClick={() => r.jobId && onOpenJob?.(r.jobId)}>
                        <b>{r.label}</b>{r.sub && <span>{r.sub}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
      </GridLayout>
      </div>
    </section>
  )
}
