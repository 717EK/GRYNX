import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { insights, SAMPLE_STATE, type Suggestion } from '../lib/insights'
import './Insights.css'

const KIND_ICON: Record<Suggestion['kind'], string> = {
  update_request: '↻',
  escalation: '⚠',
  bottleneck: '⛌',
  hold_review: '‖',
  approval: '✓',
}

export default function Insights({
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
  const summary = insights.summarize(SAMPLE_STATE)
  const list = insights.suggestions(SAMPLE_STATE)

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">Intelligence</h1>
            <span className="mono-label">Assistant · suggestions only, you decide</span>
          </div>
          <span className="ins__badge mono-label">Rule-based</span>
        </header>

        <div className="screen__scroll">
          {/* daily summary */}
          <div className="ins__summary">
            <span className="mono-label">Today’s Brief</span>
            <p className="ins__headline">{summary.headline}</p>
            <div className="ins__kpis">
              <span className="ins__kpi"><b className="display">{summary.active}</b>Active</span>
              <span className="ins__kpi"><b className="display">{summary.completedToday}</b>Done</span>
              <span className="ins__kpi"><b className="display is-warn">{summary.delayed}</b>Over SLA</span>
              <span className="ins__kpi"><b className="display is-warn">{summary.onHold}</b>On Hold</span>
            </div>
          </div>

          {/* suggestions */}
          <span className="ins__section mono-label">Suggestions <span className="jsec__count">{list.length}</span></span>
          <div className="ins__list">
            {list.map((s) => (
              <div key={s.id} className={`sugg sugg--${s.severity}`}>
                <span className="sugg__icon">{KIND_ICON[s.kind]}</span>
                <span className="sugg__body">
                  <span className="sugg__title">{s.title}</span>
                  <span className="sugg__detail mono-label">{s.detail}</span>
                </span>
                <span className="sugg__actions">
                  {s.jobId && (
                    <button className="sugg__view mono-label" onClick={onOpenJob}>View</button>
                  )}
                  <button className="btn btn--solid sugg__do">{s.action}</button>
                </span>
              </div>
            ))}
          </div>

          <p className="ins__foot mono-label">
            ⓘ Suggestions never take effect on their own. Tapping an action is logged as your decision (AI-suggested).
            Later phases add a local model / Claude for natural-language summaries &amp; Q&amp;A — same surface, richer reasoning.
          </p>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
