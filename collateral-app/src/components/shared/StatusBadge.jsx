const statusConfig = {
  Available:              { dot: "bg-emerald-500", bg: "bg-emerald-50",  text: "text-emerald-700",  border: "border-emerald-200/70" },
  Reserved:               { dot: "bg-amber-400",   bg: "bg-amber-50",    text: "text-amber-700",    border: "border-amber-200/70" },
  Locked:                 { dot: "bg-slate-400",   bg: "bg-slate-100",   text: "text-slate-600",    border: "border-slate-200" },
  Pledged:                { dot: "bg-red-500",     bg: "bg-red-50",      text: "text-red-700",      border: "border-red-200/70" },
  Active:                 { dot: "bg-emerald-500", bg: "bg-emerald-50",  text: "text-emerald-700",  border: "border-emerald-200/70" },
  Closed:                 { dot: "bg-slate-400",   bg: "bg-slate-100",   text: "text-slate-500",    border: "border-slate-200" },
  Maturing:               { dot: "bg-amber-400",   bg: "bg-amber-50",    text: "text-amber-700",    border: "border-amber-200/70" },
  "Margin deficit":       { dot: "bg-red-500",     bg: "bg-red-50",      text: "text-red-700",      border: "border-red-200/70" },
  "In compliance":        { dot: "bg-emerald-500", bg: "bg-emerald-50",  text: "text-emerald-700",  border: "border-emerald-200/70" },
  Confirmed:              { dot: "bg-emerald-500", bg: "bg-emerald-50",  text: "text-emerald-700",  border: "border-emerald-200/70" },
  "Awaiting confirmation":{ dot: "bg-amber-400",   bg: "bg-amber-50",    text: "text-amber-700",    border: "border-amber-200/70" },
  Critical:               { dot: "bg-red-500",     bg: "bg-red-50",      text: "text-red-700",      border: "border-red-200/70" },
  Warning:                { dot: "bg-amber-400",   bg: "bg-amber-50",    text: "text-amber-700",    border: "border-amber-200/70" },
  Info:                   { dot: "bg-blue-500",    bg: "bg-blue-50",     text: "text-blue-700",     border: "border-blue-200/70" },
};

const fallback = { dot: "bg-slate-400", bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" };

export function StatusBadge({ status }) {
  const cfg = statusConfig[status] ?? fallback;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {status}
    </span>
  );
}
