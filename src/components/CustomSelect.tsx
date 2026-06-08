import { useEffect, useRef, useState } from 'react'

export interface Option {
  value: string
  label: string
  desc?: string
}

export default function CustomSelect({
  value,
  options,
  onChange,
  onAddCustom,
  placeholder = 'Select…',
  addLabel = 'Add Custom',
  searchable = false,
  triggerLabel,
  triggerClassName,
}: {
  value: string
  options: Option[]
  onChange: (v: string) => void
  onAddCustom?: (name: string, desc: string) => void
  placeholder?: string
  addLabel?: string
  searchable?: boolean
  /** When set, the trigger shows this label (adder mode) and opens a full overlay sheet. */
  triggerLabel?: string
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selected = options.find((o) => o.value === value)
  const filtered =
    searchable && query.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
      : options

  const close = () => {
    setOpen(false)
    setQuery('')
    setAdding(false)
  }
  const pick = (v: string) => {
    onChange(v)
    close()
  }
  const submitCustom = () => {
    if (!name.trim() || !onAddCustom) return
    onAddCustom(name.trim(), desc.trim())
    setName('')
    setDesc('')
    close()
  }

  const Search = searchable ? (
    <input
      className="csel__search"
      placeholder="SEARCH…"
      autoFocus
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  ) : null

  const AddCustom = onAddCustom ? (
    <>
      <button className="csel__addrow" type="button" onClick={() => setAdding((a) => !a)}>
        <span className="csel__plus">+</span> {addLabel}
      </button>
      {adding && (
        <div className="csel__addform">
          <input className="csel__in" placeholder="NAME" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            className="csel__in"
            placeholder="SHORT DESCRIPTION (OPTIONAL)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <button className="csel__addbtn" type="button" onClick={submitCustom}>
            Add
          </button>
        </div>
      )}
    </>
  ) : null

  const List = (
    <>
      {filtered.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`csel__opt ${o.value === value ? 'is-sel' : ''}`}
          onClick={() => pick(o.value)}
        >
          <span className="csel__opt-label">{o.label}</span>
          {o.desc && <span className="csel__opt-desc">{o.desc}</span>}
        </button>
      ))}
      {filtered.length === 0 && <span className="csel__empty mono-label">No matches</span>}
    </>
  )

  return (
    <div className="csel" ref={ref}>
      {triggerLabel ? (
        <button className={triggerClassName} type="button" onClick={() => setOpen((o) => !o)}>
          {triggerLabel}
        </button>
      ) : (
        <button className="csel__btn" type="button" onClick={() => setOpen((o) => !o)}>
          <span className="csel__value display">{selected ? selected.label : placeholder}</span>
          <span className={`csel__chev ${open ? 'is-open' : ''}`} aria-hidden>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      )}

      {/* adder mode → full overlay sheet (keyboard-safe, never clipped) */}
      {open && triggerLabel && (
        <div className="csel__overlay" onMouseDown={close}>
          <div className="csel__sheet" onMouseDown={(e) => e.stopPropagation()}>
            <div className="csel__sheet-head">
              <span className="mono-label">{triggerLabel.replace(/^\+\s*/, '')}</span>
              <button className="csel__sheet-x" type="button" onClick={close} aria-label="Close">×</button>
            </div>
            {Search}
            {AddCustom}
            <div className="csel__sheet-list">{List}</div>
          </div>
        </div>
      )}

      {/* inline dropdown (product select) */}
      {open && !triggerLabel && (
        <div className={`csel__panel ${expanded ? 'is-expanded' : ''}`}>
          {Search}
          {AddCustom}
          <div className="csel__list">{List}</div>
          {!searchable && (
            <button className="csel__expand" type="button" onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'Collapse ⌃' : 'Expand ⌄'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
