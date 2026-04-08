import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({ title, value, description, icon: Icon, alert, trendUp }) {
  return (
    <Card className={`rounded-md shadow-sm ${alert ? "border-red-200 bg-red-50/40" : ""}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="text-sm text-slate-500">{title}</div>
            <div className={`mt-2 text-2xl font-semibold ${alert ? "text-red-700" : "text-slate-900"}`}>{value}</div>
            <div className={`mt-1 text-xs ${alert ? "text-red-500 font-medium" : trendUp ? "text-emerald-600" : "text-slate-500"}`}>
              {description}
            </div>
          </div>
          <div className={`rounded-md p-3 flex-shrink-0 ${alert ? "bg-red-100" : "bg-slate-100"}`}>
            <Icon className={`h-5 w-5 ${alert ? "text-red-600" : "text-slate-700"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
