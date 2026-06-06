import { useState } from 'react'
import './JobForm.css'

const PRODUCTS = [
  { name: 'Alloy Truss', code: 'AT' },
  { name: 'MS Truss', code: 'MT' },
  { name: 'Scaffolding', code: 'SC' },
  { name: 'Stage', code: 'ST' },
  { name: 'Mojo Alloy/MS', code: 'MJ' },
  { name: 'Lifter Alloy/MS', code: 'LF' },
  { name: 'Stacker', code: 'SK' },
]

// Canonical default pipeline (8 steps). Reconciles the mockup's "8 STEPS" label
// with combined departments Laser/Cutting and CNC/VMC. See ui-mockup-notes.md.
const PIPELINE = [
  'Design',
  'Purchase',
  'Laser/Cutting',
  'Alloy Production',
  'CNC/VMC',
  'MNTR',
  'Powder Coat',
  'FG Stock',
]

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const pad2 = (n: number) => String(n).padStart(2, '0')
const pad3 = (n: number) => String(n).padStart(3, '0')
const ddmmyy = (d: Date) => `${pad2(d.getDate())}${pad2(d.getMonth() + 1)}${String(d.getFullYear()).slice(2)}`
const longDate = (d: Date) => `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
function timeAmPm(d: Date) {
  let h = d.getHours()
  const m = pad2(d.getMinutes())
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ap}`
}

interface Model {
  id: number
  code: string
  qty: number
}

let nextId = 100

export default function JobForm({
  jobIdLabel,
  jobIdHint,
}: {
  jobIdLabel: string
  jobIdHint: string
}) {
  const [productCode, setProductCode] = useState('AT')
  const [priority, setPriority] = useState<'urgent' | 'normal'>('urgent')
  const [models, setModels] = useState<Model[]>([
    { id: 1, code: 'AT290', qty: 20 },
    { id: 2, code: 'AT400', qty: 15 },
    { id: 3, code: 'AT500', qty: 10 },
  ])
  const [showPipeline, setShowPipeline] = useState(false)

  const total = models.reduce((s, m) => s + (Number(m.qty) || 0), 0)
  const now = new Date()
  const jobId = `${productCode}-${priority === 'urgent' ? 'U' : 'N'}-${pad3(total)}-${ddmmyy(now)}-001`

  const setQty = (id: number, qty: number) =>
    setModels((ms) => ms.map((m) => (m.id === id ? { ...m, qty } : m)))
  const setCode = (id: number, code: string) =>
    setModels((ms) => ms.map((m) => (m.id === id ? { ...m, code: code.toUpperCase() } : m)))
  const addModel = () =>
    setModels((ms) => [...ms, { id: ++nextId, code: 'NEW', qty: 0 }])
  const removeModel = (id: number) => setModels((ms) => ms.filter((m) => m.id !== id))

  return (
    <div className="jobform">
      {/* JOB ID */}
      <section className="field">
        <span className="field__label mono-label">{jobIdLabel}</span>
        <div className="jobid">
          <span className="jobid__value display">{jobId}</span>
          <span className="jobid__hint mono-label">{jobIdHint}</span>
        </div>
      </section>

      {/* PRODUCT */}
      <section className="field">
        <span className="field__label mono-label">Product</span>
        <div className="select">
          <select
            className="select__el display"
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
          >
            {PRODUCTS.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="select__chev">⌄</span>
        </div>
      </section>

      {/* MODELS & QUANTITY */}
      <section className="field">
        <span className="field__label mono-label">Models &amp; Quantity</span>
        <div className="mtable">
          <div className="mtable__head mono-label">
            <span>Model</span>
            <span>Quantity</span>
          </div>
          {models.map((m) => (
            <div className="mrow" key={m.id}>
              <input
                className="mrow__code display"
                value={m.code}
                onChange={(e) => setCode(m.id, e.target.value)}
                aria-label="Model code"
              />
              <div className="mrow__right">
                <input
                  className="mrow__qty display"
                  type="number"
                  min={0}
                  value={m.qty}
                  onChange={(e) => setQty(m.id, Number(e.target.value))}
                  aria-label="Quantity"
                />
                {models.length > 1 && (
                  <button
                    className="mrow__del"
                    onClick={() => removeModel(m.id)}
                    title="Remove model"
                    aria-label="Remove model"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
          <div className="mtable__foot">
            <button className="addmodel" onClick={addModel}>
              <span className="addmodel__plus">+</span> Add Model
            </button>
            <div className="mtotal">
              <span className="mono-label">Total</span>
              <span className="mtotal__v display">{total}</span>
            </div>
          </div>
        </div>
      </section>

      {/* PRIORITY */}
      <section className="field">
        <span className="field__label mono-label">Priority</span>
        <div className="prio">
          <button
            className={`prio__opt ${priority === 'urgent' ? 'is-active' : ''}`}
            onClick={() => setPriority('urgent')}
          >
            <span className="prio__ico">⚡</span> Urgent
          </button>
          <button
            className={`prio__opt ${priority === 'normal' ? 'is-active' : ''}`}
            onClick={() => setPriority('normal')}
          >
            <span className="prio__ico">≡</span> Normal
          </button>
        </div>
      </section>

      {/* PIPELINE */}
      <section className="field">
        <div className="field__row">
          <span className="field__label mono-label">Pipeline</span>
          <button className="viewpipe mono-label" onClick={() => setShowPipeline((v) => !v)}>
            View Pipeline {showPipeline ? '⌃' : '⌄'}
          </button>
        </div>
        <div className="pipeline">
          <div className="pipeline__top">
            <svg className="pipeline__ico" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <circle cx="5" cy="6" r="2.4" />
              <circle cx="5" cy="18" r="2.4" />
              <circle cx="19" cy="12" r="2.4" />
              <line x1="7" y1="7" x2="17" y2="11" />
              <line x1="7" y1="17" x2="17" y2="13" />
            </svg>
            <span className="pipeline__count display">{PIPELINE.length} Steps</span>
          </div>
          <div className="pipeline__crumbs mono-label">{PIPELINE.join('  ›  ')}</div>
          {showPipeline && (
            <ol className="pipeline__list">
              {PIPELINE.map((s, i) => (
                <li key={s}>
                  <span className="pipeline__n mono-label">{pad2(i + 1)}</span>
                  {s}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* SCHEDULE */}
      <section className="field">
        <span className="field__label mono-label">Schedule</span>
        <div className="sched">
          <div className="sched__card">
            <span className="sched__k mono-label">📅 Start Date &amp; Time</span>
            <span className="sched__big display">Now</span>
            <span className="sched__sub mono-label">
              {longDate(now)} | {timeAmPm(now)}
            </span>
          </div>
          <div className="sched__card">
            <span className="sched__k mono-label">📅 Target Completion</span>
            <span className="sched__big display">15 Jun 2026</span>
            <span className="sched__sub mono-label">06:00 PM</span>
          </div>
        </div>
      </section>
    </div>
  )
}
