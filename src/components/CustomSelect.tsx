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
}: {
  value: string
  options: Option[]
  onChange: (v: string) => void
  onAddCustom?: (name: string, desc: string) => void
  placeholder?: string
  addLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selected = options.find((o) => o.value === value)

  const submitCustom = () => {
    if (!name.trim() || !onAddCustom) return
    onAddCustom(name.trim(), desc.trim())
    setName('')
    setDesc('')
    setAdding(false)
    setOpen(false)
  }

  return (
    <div className="csel" ref={ref}>
      <button className="csel__btn" onClick={() => setOpen((o) => !o)} type="button">
        <span className="csel__value display">{selected ? selected.label : placeholder}</span>
        <span className="csel__chev">{open ? '⌃' : '⌄'}</span>
      </button>

      {open && (
        <div className={`csel__panel ${expanded ? 'is-expanded' : ''}`}>
          {onAddCustom && (
            <>
              <button className="csel__addrow" type="button" onClick={() => setAdding((a) => !a)}>
                <span className="csel__plus">+</span> {addLabel}
              </button>
              {adding && (
                <div className="csel__addform">
                  <input
                    className="csel__in"
                    placeholder="NAME"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
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
          )}

          <div className="csel__list">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`csel__opt ${o.value === value ? 'is-sel' : ''}`}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                <span className="csel__opt-label">{o.label}</span>
                {o.desc && <span className="csel__opt-desc">{o.desc}</span>}
              </button>
            ))}
          </div>

          <button className="csel__expand" type="button" onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Collapse ⌃' : 'Expand ⌄'}
          </button>
        </div>
      )}
    </div>
  )
}
