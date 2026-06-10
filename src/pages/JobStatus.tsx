import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { navTo } from '../lib/nav'
import { getJobs, type JobDTO } from '../lib/api'
import './JobStatus.css'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  in_production: 'In Production',
  in_qc: 'In QC',
  in_fg: 'In FG Stock',
  close_requested: 'Closure Requested',
  closed: 'Closed',
  cancelled: 'Cancelled',
}
// map a job status to one of the existing status tone classes
const TONE: Record<string, 'in_progress' | 'waiting' | 'on_hold' | 'done'> = {
  approved: 'waiting',
  in_production: 'in_progress',
  in_qc: 'in_progress',
  in_fg: 'in_progress',
  close_requested: 'on_hold',
  closed: 'done',
  cancelled: 'done',
}
const STEP_LABEL: Record<string, string> = {
  waiting_acceptance: 'Awaiting',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
}
const STEP_TONE: Record<string, 'in_progress' | 'waiting' | 'on_hold'> = {
  waiting_acceptance: 'waiting',
  in_progress: 'in_progress',
  on_hold: 'on_hold',
}
// what to show in the pill: the live station ("Design · Awaiting") when the job is
// on the floor, else the coarse job status (Closed, Closure Requested, …)
function statusOf(j: JobDTO): { label: string; tone: 'in_progress' | 'waiting' | 'on_hold' | 'done' } {
  if (j.current && !['closed', 'cancelled', 'close_requested'].includes(j.status)) {
    return { label: `${j.current.department.name} · ${STEP_LABEL[j.current.status] ?? j.current.status}`, tone: STEP_TONE[j.current.status] ?? 'in_progress' }
  }
  return { label: STATUS_LABEL[j.status] ?? j.status, tone: TONE[j.status] ?? 'in_progress' }
}

function fmtDate(iso?: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}

export default function JobStatus({
  user,
  onBack,
  onLock,
  onOpenJob,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onOpenJob: (id: string) => void
}) {
  const [jobs, setJobs] = useState<JobDTO[] | null>(null)
  useEffect(() => {
    getJobs()
      .then((r) => setJobs(r.jobs))
      .catch(() => setJobs([]))
  }, [])

  const attention = (jobs ?? []).filter((j) => j.status === 'close_requested')
  const active = (jobs ?? []).filter((j) => !['closed', 'cancelled', 'draft', 'close_requested'].includes(j.status))
  const completed = (jobs ?? []).filter((j) => j.status === 'closed')

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">Job Status</h1>
            <span className="mono-label">{jobs ? `${jobs.length} jobs · live` : 'Loading…'}</span>
          </div>
          <span />
        </header>

        <div className="screen__scroll">
          <div className="js__stages">
            <button className="js__stage" onClick={() => navTo('ppcrequest')}>PPC Request</button>
            <button className="js__stage" onClick={() => navTo('qc')}>QC</button>
            <button className="js__stage" onClick={() => navTo('fgclosure')}>FG Stock</button>
          </div>

          {jobs === null ? (
            <span className="js__empty mono-label">Loading jobs…</span>
          ) : jobs.length === 0 ? (
            <span className="js__empty mono-label">No jobs yet — create one to get started.</span>
          ) : (
            <>
              {attention.length > 0 && (
                <Section title="Needs Attention" jobs={attention} onOpenJob={onOpenJob} />
              )}
              <Section title="Active Jobs" jobs={active} onOpenJob={onOpenJob} emptyText="No active jobs." />
              {completed.length > 0 && (
                <Section title="Completed" jobs={completed} onOpenJob={onOpenJob} done />
              )}
            </>
          )}
        </div>
      </main>
      <BottomBar />
    </div>
  )
}

function Section({
  title,
  jobs,
  onOpenJob,
  done,
  emptyText,
}: {
  title: string
  jobs: JobDTO[]
  onOpenJob: (id: string) => void
  done?: boolean
  emptyText?: string
}) {
  return (
    <section className="jsec">
      <h2 className="jsec__title mono-label">
        {title} <span className="jsec__count">{jobs.length}</span>
      </h2>
      <div className="jlist">
        {jobs.length === 0 && emptyText ? (
          <span className="js__empty mono-label">{emptyText}</span>
        ) : (
          jobs.map((j) => {
            const st = statusOf(j)
            return (
              <button key={j.id} className={`jrow ${done ? 'jrow--done' : ''}`} onClick={() => onOpenJob(j.id)}>
                <span className={`jrow__pri jrow__pri--${done ? 'done' : j.priority === 'urgent' ? 'urgent' : 'normal'}`} />
                <span className="jrow__main">
                  <span className="jrow__id display">{j.displayLabel}</span>
                  <span className="jrow__sub mono-label">
                    {j.product?.name ?? ''} · {j.totalQty} units{done && j.completionDate ? ` · ${fmtDate(j.completionDate)}` : ''}
                  </span>
                </span>
                <span className={`jstatus jstatus--${st.tone} mono-label`}>
                  <span className="jstatus__dot" />
                  {st.label}
                </span>
                <span className="jrow__arrow">→</span>
              </button>
            )
          })
        )}
      </div>
    </section>
  )
}
