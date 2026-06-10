import { navTo } from '../lib/nav'
import './ReportButton.css'

// "Report an issue" — present on every landing so anyone on the floor can raise
// a maintenance ticket from where they are. Routes to the Maintenance screen.
export default function ReportButton({ className = '' }: { className?: string }) {
  return (
    <button className={`reportbtn mono-label ${className}`} onClick={() => navTo('maintenance')} title="Report an issue">
      ⚠ REPORT
    </button>
  )
}
