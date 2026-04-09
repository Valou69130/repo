import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({ title, value, description, icon: Icon, alert, trendUp }) {
  return (
    <Card className={`overflow-hidden rounded-2xl border shadow-sm ${alert ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white"}`}>
      <CardContent className="relative p-5">
        <div className="min-w-0 pr-16">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">{title}</div>
            <div className={`mt-3 break-words text-[clamp(1.55rem,2.2vw,2rem)] font-semibold leading-tight tracking-tight ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</div>
            <div className={`mt-2 text-xs leading-5 ${alert ? "font-medium text-red-600" : trendUp ? "text-emerald-600" : "text-slate-500"}`}>
              {description}
            </div>
        </div>
        <div className={`absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-xl ${alert ? "bg-red-100" : "bg-slate-100"}`}>
          <Icon className={`h-4.5 w-4.5 ${alert ? "text-red-600" : "text-slate-700"}`} />
        </div>
      </CardContent>
    </Card>
  );
}
