import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import JobForm from '../components/JobForm'

export default function PpcReview({
  user,
  onBack,
  onLock,
  onApprove,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onApprove: () => void
}) {
  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body jobscreen">
        <header className="jobscreen__head">
          <button className="jobscreen__back" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div className="jobscreen__titles">
            <h1 className="jobscreen__title display">
              PPC Request Review <span className="jobscreen__pr">PR-0001</span>
            </h1>
            <span className="mono-label">Review PPC request and approve to create job</span>
          </div>
          <span />
        </header>

        <div className="jobscreen__scroll">
          <JobForm
            jobIdLabel="Job ID (Auto Generated)"
            jobIdHint="[ PRODUCT ][ PRIORITY ][ QTY ][ DATE ][ SEQ ]"
          />

          <div className="jobscreen__actions jobscreen__actions--two">
            <button className="btn btn--solid btn--block" onClick={onApprove}>
              <span>✓</span> Approve &amp; Create Job
            </button>
            <button className="btn btn--danger btn--block" onClick={onBack}>
              <span>RC</span>
            </button>
            <span className="jobscreen__note mono-label">
              ⓘ Approving will create the job and move it to the first stage in pipeline.
            </span>
          </div>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
