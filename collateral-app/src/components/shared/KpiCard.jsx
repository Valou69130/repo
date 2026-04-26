export function KpiCard({ title, value, description, alert, trendUp }) {
  const topBorder = alert
    ? "border-t-red-500"
    : trendUp === false
    ? "border-t-amber-400"
    : "border-t-blue-500";

  return (
    <div className={`border border-t-2 bg-white p-4 flex flex-col justify-between ${topBorder} ${
      alert ? "border-red-200" : "border-slate-200/80"
    }`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">{title}</div>
      <div>
        <div className={`text-[1.45rem] font-bold leading-none tabular-nums tracking-tight ${
          alert ? "text-red-600" : "text-slate-900"
        }`}>{value}</div>
        <div className={`mt-1.5 text-[11px] font-medium ${
          alert ? "text-red-500" : trendUp ? "text-emerald-600" : "text-slate-400"
        }`}>
          {description}
        </div>
      </div>
    </div>
  );
}
