import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({ title, value, description, alert, trendUp }) {
  return (
    <Card className={`overflow-hidden rounded-lg border shadow-sm ${alert ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white"}`}>
      <CardContent className="p-5">
        <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">{title}</div>
            <div className={`mt-3 whitespace-nowrap text-[clamp(1.1rem,1.55vw,1.8rem)] font-semibold leading-tight tracking-tight ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</div>
            <div className={`mt-2 text-xs leading-5 ${alert ? "font-medium text-red-600" : trendUp ? "text-emerald-600" : "text-slate-500"}`}>
              {description}
            </div>
        </div>
      </CardContent>
    </Card>
  );
}
