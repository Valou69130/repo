import { useAIStatus } from '@/ai/hooks/useAI';

const SEVERITY_STYLES = {
  Critical: 'bg-red-50 border-red-200 text-red-800',
  Warning:  'bg-amber-50 border-amber-200 text-amber-800',
  Info:     'bg-blue-50 border-blue-200 text-blue-800',
};

const ACTION_LABELS = {
  top_up:       'Top-up required',
  margin_call:  'Margin call warranted',
  substitute:   'Substitution recommended',
  monitor:      'Monitor closely',
  none:         'No action needed',
};

function StructuredStrip({ data }) {
  if (!data) return null;
  const severityStyle = SEVERITY_STYLES[data.severity] || SEVERITY_STYLES.Info;
  const actionLabel  = ACTION_LABELS[data.recommendedAction] || data.recommendedAction;
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-sm border px-3 py-2 text-[11px] font-medium ${severityStyle}`}>
      <span className="uppercase tracking-[0.1em]">{data.severity}</span>
      <span className="text-current/60">·</span>
      <span>{actionLabel}</span>
      {data.belowMTA && (
        <><span className="text-current/60">·</span><span>Below MTA — no call needed</span></>
      )}
      {data.confidenceScore != null && (
        <><span className="text-current/60">·</span><span>{Math.round(data.confidenceScore * 100)}% confidence</span></>
      )}
      {data.affectedRepos?.length > 0 && (
        <><span className="text-current/60">·</span><span>{data.affectedRepos.join(', ')}</span></>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden
    />
  );
}

// Lightweight markdown-ish renderer — bold (**), headings (##), bullets (-),
// paragraphs. We keep this tiny to avoid a markdown dep and to preserve the
// terse visual language of the rest of the UI.
function renderBody(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const blocks = [];
  let bullets = [];
  let paragraph = [];

  const flushPara = () => {
    if (paragraph.length) {
      blocks.push(<p key={blocks.length} className="leading-relaxed text-neutral-700">{formatInline(paragraph.join(' '))}</p>);
      paragraph = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc space-y-1 pl-5 text-neutral-700">
          {bullets.map((b, i) => <li key={i}>{formatInline(b)}</li>)}
        </ul>
      );
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushBullets(); continue; }
    if (line.startsWith('## ')) {
      flushPara(); flushBullets();
      blocks.push(<h4 key={blocks.length} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">{line.slice(3)}</h4>);
    } else if (/^\*\*(.+?)\*\*:?$/.test(line)) {
      flushPara(); flushBullets();
      blocks.push(<h4 key={blocks.length} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">{line.replace(/\*\*/g, '').replace(/:$/, '')}</h4>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      flushPara();
      bullets.push(line.slice(2));
    } else {
      flushBullets();
      paragraph.push(line);
    }
  }
  flushPara(); flushBullets();
  return blocks;
}

function formatInline(s) {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p)
      ? <strong key={i} className="font-semibold text-neutral-900">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

/**
 * AI Reasoning Panel — renders the streaming-free result of a single AI call.
 *
 * Required props:
 *  - title: section title
 *  - loading, error, text, meta, onRun, onReset: shape returned by useAICall
 *  - buttonLabel: label for the trigger
 */
export function AIReasoningPanel({ title, description, loading, error, text, meta, onRun, onReset, buttonLabel = 'Run AI analysis' }) {
  const aiEnabled = useAIStatus();
  const disabled = aiEnabled === false;

  return (
    <section className="rounded-md border border-neutral-200 bg-white">
      <header className="flex items-start justify-between gap-4 border-b border-neutral-200 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-900">{title}</h3>
          </div>
          {description && <p className="mt-1 text-xs text-neutral-500">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {text && !loading && (
            <button
              type="button"
              onClick={onReset}
              className="h-7 rounded-sm border border-neutral-200 bg-white px-2 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onRun}
            disabled={loading || disabled}
            className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-neutral-900 px-3 text-[11px] font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <><Spinner /> Thinking…</> : buttonLabel}
          </button>
        </div>
      </header>

      <div className="px-4 py-4">
        {disabled && (
          <p className="text-xs text-neutral-500">
            AI layer is disabled. Set <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10.5px]">AI_ENABLED=true</code> and provide <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10.5px]">ANTHROPIC_API_KEY</code> on the API to enable.
          </p>
        )}
        {!disabled && !text && !loading && !error && (
          <p className="text-xs text-neutral-500">No analysis yet. Run the agent to produce a briefing.</p>
        )}
        {error && (
          <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        )}
        {text && (
          <div className="space-y-3 text-[13px]">
            <StructuredStrip data={meta?.structured} />
            {renderBody(text)}
            {meta?.toolsUsed?.length > 0 && (
              <footer className="mt-4 border-t border-neutral-100 pt-2 text-[10.5px] uppercase tracking-[0.12em] text-neutral-400">
                Tools used: {meta.toolsUsed.join(' · ')}
                {meta.usage && ` · ${meta.usage.inputTokens}+${meta.usage.outputTokens} tok`}
                {' · human review required before action'}
              </footer>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
