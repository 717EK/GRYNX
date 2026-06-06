import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import JobForm from '../components/JobForm'

export default function CreateJob({
  user,
  onBack,
  onLock,
  onOpenPpc,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onOpenPpc: () => void
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
            <h1 className="jobscreen__title display">Create Job</h1>
            <span className="mono-label">Create a new production job</span>
          </div>
          <button className="jobscreen__pill" onClick={onOpenPpc} title="Pending PPC requests">
            <span className="jobscreen__pill-n display">02</span>
            <span className="mono-label">PPC →</span>
          </button>
        </header>

        <div className="jobscreen__scroll">
          <JobForm jobIdLabel="Job ID" jobIdHint="[ PRODUCT ][ PRIORITY ][ QTY ][ DATE ][ SEQ ]" />

          <div className="jobscreen__actions">
            <button className="btn btn--solid btn--block">
              <span>📄</span> Create Job
            </button>
            <span className="jobscreen__note mono-label">
              ⓘ A job sheet with barcode will be generated after job creation.
            </span>
          </div>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
