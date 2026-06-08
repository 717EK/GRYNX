import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import JobForm from '../components/JobForm'

// PPC role: build a production request and submit it for Admin approval.
// Reuses the shared JobForm; only the header + action differ from Create Job.
export default function PpcRequest({
  user,
  onBack,
  onLock,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
}) {
  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body jobscreen">
        <header className="jobscreen__head">
          <button className="jobscreen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="jobscreen__titles">
            <h1 className="jobscreen__title display">
              New Request <span className="jobscreen__pr">PR-0003</span>
            </h1>
            <span className="mono-label">PPC · submit for admin approval</span>
          </div>
          <span />
        </header>
        <div className="jobscreen__scroll">
          <JobForm jobIdLabel="Reference (Auto)" />
          <div className="jobscreen__actions">
            <button className="btn btn--solid btn--block" onClick={onBack}>↗ Submit For Approval</button>
            <span className="jobscreen__note mono-label">ⓘ Admin reviews, then approves to create the job.</span>
          </div>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
