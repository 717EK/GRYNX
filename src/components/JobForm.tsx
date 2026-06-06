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

// All departments selectable when editing a pipeline.
const DEPARTMENTS = [
  'Design',
  'Purchase',
  'Laser/Cutting',
  'MS Production',
  'Alloy Production',
  'CNC/VMC',
  'MNTR',
  'Powder Coat',
  'QC',
  'FG Stock',
  'Maintenance',
]

// Canonical default pipeline (8 steps). Reconciles the mockup's "8 STEPS" label
// with combined departments Laser/Cutting and CNC/VMC. See ui-mockup-notes.md.
const DEFAULT_PIPELINE = [
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
  const [pipeline, setPipeline] = useState<string[]>(DEFAULT_PIPELINE)
  const [editingPipe, setEditingPipe] = useState(false)

  const total = models.reduce((s, m) => s + (Number(m.qty) || 0), 0)
  const now = new Date()
  const jobId = `${productCode}-${priority === 'urgent' ? 'U' : 'N'}-${pad3(total)}-${ddmmyy(now)}-001`

  const setQty = (id: number, qty: number) =>
    setModels((ms) => ms.map((m) => (m.id === id ? { ...m, qty } : m)))
  const setCode = (id: number, code: string) =>
    setModels((ms) => ms.map((m) => (m.id === id ? { ...m, code: code.toUpperCase() } : m)))
  const addModel = () => setModels((ms) => [...ms, { id: ++nextId, code: 'NEW', qty: 0 }])
  const removeModel = (id: number) => setModels((ms) => ms.filter((m) => m.id !== id))

  return (
    <div className="jobform">
      {/* JOB ID */}
      <section className="field field--id">
        <span className="field__label mono-label">{jobIdLabel}</span>
        <div className="jobid">
          <span className="jobid__value display">{jobId}</span>
          <span className="jobid__hint mono-label">{jobIdHint}</span>
        </div>
      </section>

      {/* PRODUCT */}
      <section className="field field--product">
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
      <section className="field field--models">
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
                  <button className="mrow__del" onClick={() => removeModel(m.id)} aria-label="Remove model">
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
      <section className="field field--priority">
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
      <section className="field field--pipeline">
        <span className="field__label mono-label">Pipeline</span>
        <div className="pipeline">
          <div className="pipeline__top">
            <svg className="pipeline__ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <circle cx="5" cy="6" r="2.4" />
              <circle cx="5" cy="18" r="2.4" />
              <circle cx="19" cy="12" r="2.4" />
              <line x1="7" y1="7" x2="17" y2="11" />
              <line x1="7" y1="17" x2="17" y2="13" />
            </svg>
            <span className="pipeline__count display">{pipeline.length} Steps</span>
            <button className="editpipe mono-label" onClick={() => setEditingPipe(true)}>
              Edit Pipeline ›
            </button>
          </div>
          <div className="pipeline__crumbs mono-label">{pipeline.join('  ›  ')}</div>
        </div>
      </section>

      {/* SCHEDULE */}
      <section className="field field--schedule">
        <span className="field__label mono-label">Schedule</span>
        <div className="sched">
          <div className="sched__card">
            <span className="sched__k mono-label">Start Date &amp; Time</span>
            <span className="sched__big display">Now</span>
            <span className="sched__sub mono-label">
              {longDate(now)} | {timeAmPm(now)}
            </span>
          </div>
          <div className="sched__card">
            <span className="sched__k mono-label">Target Completion</span>
            <span className="sched__big display">15 Jun 2026</span>
            <span className="sched__sub mono-label">06:00 PM</span>
          </div>
        </div>
      </section>

      {editingPipe && (
        <PipelineEditor
          steps={pipeline}
          onChange={setPipeline}
          onClose={() => setEditingPipe(false)}
        />
      )}
    </div>
  )
}

/* ---- Editable pipeline (modal) ---- */
function PipelineEditor({
  steps,
  onChange,
  onClose,
}: {
  steps: string[]
  onChange: (s: string[]) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<string[]>(steps)
  const [toAdd, setToAdd] = useState(DEPARTMENTS[0])

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= draft.length) return
    const next = [...draft]
    ;[next[i], next[j]] = [next[j], next[i]]
    setDraft(next)
  }
  const remove = (i: number) => setDraft((d) => d.filter((_, idx) => idx !== i))
  const add = () => setDraft((d) => [...d, toAdd])

  const save = () => {
    onChange(draft)
    onClose()
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal__card" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3 className="modal__title display">Edit Pipeline</h3>
          <button className="modal__x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <ol className="pe__list">
          {draft.map((s, i) => (
            <li className="pe__row" key={`${s}-${i}`}>
              <span className="pe__n mono-label">{pad2(i + 1)}</span>
              <span className="pe__name">{s}</span>
              <span className="pe__ctl">
                <button className="pe__btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  ↑
                </button>
                <button
                  className="pe__btn"
                  onClick={() => move(i, 1)}
                  disabled={i === draft.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button className="pe__btn pe__btn--del" onClick={() => remove(i)} aria-label="Remove step">
                  ×
                </button>
              </span>
            </li>
          ))}
        </ol>

        <div className="pe__add">
          <select className="pe__select" value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button className="pe__addbtn" onClick={add}>
            + Add Step
          </button>
        </div>

        <div className="pe__actions">
          <button className="btn btn--solid btn--block" onClick={save}>
            Save For This Job
          </button>
          <button className="btn btn--primary btn--block" onClick={save}>
            Save For Future Jobs
          </button>
        </div>
      </div>
    </div>
  )
}
