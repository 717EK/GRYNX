import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import './JobStatus.css'

type Pri = 'urgent' | 'normal'
type JStatus = 'in_progress' | 'waiting' | 'on_hold'

const STATUS_LABEL: Record<JStatus, string> = {
  in_progress: 'In Progress',
  waiting: 'Waiting',
  on_hold: 'On Hold',
}

const ATTENTION: { kind: 'approval' | 'closure' | 'issue'; title: string; meta: string }[] = [
  { kind: 'approval', title: 'PR-0002 · Alloy Truss', meta: 'PPC request — awaiting approval' },
  { kind: 'closure', title: 'AT-U-040-040626-001', meta: 'FG Stock — closure requested' },
  { kind: 'issue', title: 'ST-N-012-050626-004', meta: 'On hold 3 days — Powder Coat' },
]

const ACTIVE: { id: string; product: string; dept: string; pri: Pri; status: JStatus }[] = [
  { id: 'AT-U-045-060626-001', product: 'Alloy Truss', dept: 'CNC / VMC', pri: 'urgent', status: 'in_progress' },
  { id: 'MT-N-030-060626-002', product: 'MS Truss', dept: 'MS Production', pri: 'normal', status: 'in_progress' },
  { id: 'SC-N-008-050626-003', product: 'Scaffolding', dept: 'Laser / Cutting', pri: 'normal', status: 'waiting' },
  { id: 'ST-N-012-050626-004', product: 'Stage', dept: 'Powder Coat', pri: 'normal', status: 'on_hold' },
  { id: 'MJ-N-015-050626-005', product: 'Mojo Alloy/MS', dept: 'Alloy Production', pri: 'normal', status: 'in_progress' },
]

const COMPLETED: { id: string; product: string; meta: string }[] = [
  { id: 'AT-N-020-040626-001', product: 'Alloy Truss', meta: 'Closed · 04 Jun' },
  { id: 'LF-N-006-030626-002', product: 'Lifter Alloy/MS', meta: 'Closed · 03 Jun' },
  { id: 'MJ-N-010-020626-001', product: 'Mojo Alloy/MS', meta: 'Closed · 02 Jun' },
]

export default function JobStatus({
  user,
  onBack,
  onLock,
  onOpenJob,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onOpenJob: () => void
}) {
  const openJob = onOpenJob

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div className="screen__titles">
            <h1 className="screen__title display">Job Status</h1>
            <span className="mono-label">Track. Monitor. Update.</span>
          </div>
        </header>

        <div className="screen__scroll">
          {/* NEEDS ATTENTION */}
          <section className="jsec">
            <h2 className="jsec__title mono-label">
              Needs Attention <span className="jsec__count">{ATTENTION.length}</span>
            </h2>
            <div className="jlist">
              {ATTENTION.map((a) => (
                <button key={a.title} className={`attn attn--${a.kind}`} onClick={openJob}>
                  <span className="attn__icon">{a.kind === 'issue' ? '⚠' : a.kind === 'closure' ? '◳' : '✓'}</span>
                  <span className="attn__main">
                    <span className="attn__title">{a.title}</span>
                    <span className="attn__meta mono-label">{a.meta}</span>
                  </span>
                  <span className="attn__tag mono-label">{a.kind}</span>
                  <span className="jrow__arrow">→</span>
                </button>
              ))}
            </div>
          </section>

          {/* ACTIVE JOBS */}
          <section className="jsec">
            <h2 className="jsec__title mono-label">
              Active Jobs <span className="jsec__count">{ACTIVE.length}</span>
            </h2>
            <div className="jlist">
              {ACTIVE.map((j) => (
                <button key={j.id} className="jrow" onClick={openJob}>
                  <span className={`jrow__pri jrow__pri--${j.pri}`} />
                  <span className="jrow__main">
                    <span className="jrow__id display">{j.id}</span>
                    <span className="jrow__sub mono-label">
                      {j.product} · {j.dept}
                    </span>
                  </span>
                  <span className={`jstatus jstatus--${j.status} mono-label`}>
                    <span className="jstatus__dot" />
                    {STATUS_LABEL[j.status]}
                  </span>
                  <span className="jrow__arrow">→</span>
                </button>
              ))}
            </div>
          </section>

          {/* COMPLETED */}
          <section className="jsec">
            <h2 className="jsec__title mono-label">
              Completed <span className="jsec__count">{COMPLETED.length}</span>
            </h2>
            <div className="jlist">
              {COMPLETED.map((j) => (
                <button key={j.id} className="jrow jrow--done" onClick={openJob}>
                  <span className="jrow__pri jrow__pri--done" />
                  <span className="jrow__main">
                    <span className="jrow__id display">{j.id}</span>
                    <span className="jrow__sub mono-label">
                      {j.product} · {j.meta}
                    </span>
                  </span>
                  <span className="jstatus jstatus--done mono-label">
                    <span className="jstatus__dot" />
                    Closed
                  </span>
                  <span className="jrow__arrow">→</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
