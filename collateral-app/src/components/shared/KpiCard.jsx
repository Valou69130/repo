import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({ title, value, description, alert, trendUp }) {
  const accentColor = alert
    ? "bg-red-500"
    : trendUp === false
    ? "bg-amber-400"
    : "bg-blue-500";

  return (
    <Card className={`overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md ${
      alert ? "border-red-200 bg-red-50/40" : "border-slate-200/80 bg-white"
    }`}>
      {/* Top accent bar */}
      <div className={`h-0.5 w-full ${accentColor} opacity-80`} />
      <CardContent className="p-5">
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</div>
          <div className={`mt-2.5 whitespace-nowrap text-[clamp(1.15rem,1.6vw,1.9rem)] font-bold leading-tight tracking-tight ${
            alert ? "text-red-700" : "text-slate-900"
          }`}>{value}</div>
          <div className={`mt-1.5 text-[11.5px] leading-5 ${
            alert ? "font-semibold text-red-500" : trendUp ? "font-medium text-emerald-600" : "text-slate-400"
          }`}>
            {description}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
