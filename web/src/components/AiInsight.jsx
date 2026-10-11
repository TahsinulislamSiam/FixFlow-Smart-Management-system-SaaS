import { cx, titleCase } from '../lib/format.js';
import { FLAG_META, PRIORITY_META, SENTIMENT_META, TONE_HEX, TONE_SOLID } from '../lib/constants.js';
import { Pill, ProgressBar, Skeleton } from './ui.jsx';
import { SparkIcon } from './icons.jsx';

/**
 * The AI triage readout. Used live in the report form (prediction while typing)
 * and again on the ticket page (what the engine actually decided).
 */
export function AiInsight({ analysis, loading = false, className, variant = 'full' }) {
  if (loading) {
    return (
      <div className={cx('surface space-y-3 p-4', className)}>
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className={cx('surface flex items-start gap-3 p-4', className)}>
        <SparkIcon size={18} className="mt-0.5 shrink-0 text-accent-400" />
        <div>
          <h3 className="text-sm font-semibold text-ink-100">AI triage runs as you type</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-400">
            Describe the problem and FixFlow will suggest the trade, priority and urgency — and flag anything
            dangerous before it reaches a technician.
          </p>
        </div>
      </div>
    );
  }

  if (analysis.skipped) {
    return (
      <div className={cx('surface flex items-start gap-3 p-4', className)}>
        <SparkIcon size={18} className="mt-0.5 shrink-0 text-ink-400" />
        <p className="text-xs leading-relaxed text-ink-400">{analysis.reason ?? 'Add a little more detail to get a prediction.'}</p>
      </div>
    );
  }

  const priority = PRIORITY_META[analysis.priority] ?? PRIORITY_META.MEDIUM;
  const sentiment = SENTIMENT_META[analysis.sentiment] ?? SENTIMENT_META.neutral;
  const confidence = Math.round((analysis.confidence ?? 0) * 100);

  return (
    <div className={cx('surface relative overflow-hidden p-4', className)}>
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-brand-400 via-accent-400 to-transparent" aria-hidden />

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="brand">
          <SparkIcon size={12} /> AI triage
        </Pill>
        <Pill tone={priority.tone}>{priority.label} priority</Pill>
        <Pill tone={sentiment.tone}>Tone: {sentiment.label}</Pill>
        {analysis.source === 'llm' ? <Pill tone="ok">LLM + heuristics</Pill> : <Pill tone="neutral">Offline model</Pill>}
      </div>

      <h3 className="mt-3 text-lg font-semibold text-white">{analysis.category_label ?? titleCase(analysis.category)}</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-300">{analysis.summary}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-ink-400">
            <span className="font-semibold tracking-wide uppercase">Urgency</span>
            <span className="text-ink-200">
              {analysis.urgency}/100
            </span>
          </div>
          <ProgressBar
            value={analysis.urgency}
            tone={analysis.urgency >= 70 ? 'danger' : analysis.urgency >= 45 ? 'warn' : 'ok'}
          />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-ink-400">
            <span className="font-semibold tracking-wide uppercase">Confidence</span>
            <span className="text-ink-200">{confidence}%</span>
          </div>
          <ProgressBar value={confidence} tone={confidence >= 70 ? 'brand' : 'neutral'} />
        </div>
      </div>

      {analysis.flags?.length ? (
        <div className="mt-4 rounded-xl border border-danger-400/30 bg-danger-500/8 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-danger-400 uppercase">
            ⚠ Safety signals detected
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {analysis.flags.map((flag) => (
              <Pill key={flag} tone={FLAG_META[flag]?.tone ?? 'danger'}>
                {FLAG_META[flag]?.label ?? flag}
              </Pill>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-300">
            These are escalated to the manager on duty immediately and cannot be downgraded by the model.
          </p>
        </div>
      ) : null}

      {variant === 'full' ? (
        <>
          {analysis.drivers?.length ? (
            <div className="mt-4">
              <p className="text-[11px] font-semibold tracking-wide text-ink-400 uppercase">Why</p>
              <ul className="mt-1.5 space-y-1">
                {analysis.drivers.slice(0, 4).map((driver) => (
                  <li key={`${driver.signal}-${driver.weight}`} className="flex items-center gap-2 text-[11px] text-ink-300">
                    <span className={cx('h-1.5 w-1.5 rounded-full', driver.weight >= 0 ? TONE_SOLID.warn : TONE_SOLID.info)} />
                    <span className="font-medium text-ink-200">“{driver.signal}”</span>
                    <span className="text-ink-500">
                      {driver.weight > 0 ? '+' : ''}
                      {driver.weight} urgency
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {analysis.suggested_actions?.length ? (
            <div className="mt-4">
              <p className="text-[11px] font-semibold tracking-wide text-ink-400 uppercase">Suggested first actions</p>
              <ol className="mt-1.5 space-y-1.5">
                {analysis.suggested_actions.map((action, index) => (
                  <li key={action} className="flex gap-2 text-[11px] leading-relaxed text-ink-300">
                    <span
                      className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                      style={{ background: TONE_HEX.brand }}
                    >
                      {index + 1}
                    </span>
                    {action}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {analysis.tags?.map((tag) => (
              <Pill key={tag} tone="neutral">
                #{tag}
              </Pill>
            ))}
            {analysis.estimated_hours ? <Pill tone="info">≈ {analysis.estimated_hours}h effort</Pill> : null}
          </div>
        </>
      ) : null}

      <p className="mt-3 text-[10px] text-ink-500">
        Model {analysis.model ?? 'fixflow-triage-v1'} · suggestion only, a manager can always override
      </p>
    </div>
  );
}
