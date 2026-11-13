import { useT } from '../i18n'
import { formatLatency } from '../lib/format'
import { useStore } from '../lib/store'
import { useNow } from '../lib/useNow'
import { timelineStore, type TimelineRow } from '../stores/timeline'

const STATUS_STYLE: Record<TimelineRow['status'], string> = {
  running: 'bg-info-light text-mist-900',
  ok: 'bg-success-light text-success-foreground',
  error: 'bg-error-light text-error-foreground',
  denied: 'bg-error-light text-error-foreground',
  cancelled: 'bg-mist-100 text-mist-700',
}

function Elapsed({ row }: { row: TimelineRow }) {
  const running = row.status === 'running'
  const now = useNow(200, running)
  if (!running) return <>{row.latencyMs === null ? '' : formatLatency(row.latencyMs)}</>
  return <>{formatLatency(Math.max(0, now - row.startedAt * 1000))}</>
}

/** "Agents at work": one row per tool call, showing who ran it, where, how it was scheduled and how long it took. */
export function Timeline() {
  const t = useT()
  const rows = useStore(timelineStore, (s) => s.rows)
  if (rows.length === 0) return <p className="px-3 py-3 text-xs text-mist-600">{t.timelineEmpty}</p>
  return (
    <ol className="flex flex-col gap-1.5 px-3 py-2">
      {rows.map((row) => (
        <li key={row.callId} className={`rounded-md border border-mist-900/10 bg-white px-2 py-1.5 text-xs ${row.parentCallId ? 'ml-4 border-l-2 border-l-brand-coral/60' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <code className="truncate font-mono text-[12px] font-semibold text-mist-900">{row.tool}</code>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${row.behavior === 'NON_BLOCKING' ? 'bg-brand-coral/15 text-brand-red' : 'bg-mist-100 text-mist-700'}`}>{row.behavior}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-mist-700">
            <span>{t[`agent_${row.agent}`]}</span>
            <span className="text-mist-600">· {t[`runsOn_${row.runsOn}`]}</span>
            {row.schedulingRequested ? (
              <span className="font-mono text-[11px]">
                {row.schedulingRequested}
                {row.schedulingEffective && row.schedulingEffective !== row.schedulingRequested ? ` → ${row.schedulingEffective}` : ''}
              </span>
            ) : null}
            <span className="ml-auto tabular-nums"><Elapsed row={row} /></span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[row.status]}`}>{t[`status_${row.status}`]}</span>
          </div>
          {row.stage ?? row.summary ?? row.argsSummary ? <p className="mt-0.5 truncate text-[11px] text-mist-600">{row.stage ?? row.summary ?? row.argsSummary}</p> : null}
        </li>
      ))}
    </ol>
  )
}
