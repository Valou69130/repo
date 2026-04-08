import { Badge } from "@/components/ui/badge";

const statusColors = {
  Available: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Reserved: "bg-amber-100 text-amber-800 border-amber-200",
  Locked: "bg-slate-200 text-slate-800 border-slate-300",
  Pledged: "bg-red-100 text-red-800 border-red-200",
  Active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Closed: "bg-slate-200 text-slate-800 border-slate-300",
  Maturing: "bg-amber-100 text-amber-800 border-amber-200",
  "Margin deficit": "bg-red-100 text-red-800 border-red-200",
  "In compliance": "bg-emerald-100 text-emerald-800 border-emerald-200",
  Confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Awaiting confirmation": "bg-amber-100 text-amber-800 border-amber-200",
  Critical: "bg-red-100 text-red-800 border-red-200",
  Warning: "bg-amber-100 text-amber-800 border-amber-200",
  Info: "bg-blue-100 text-blue-800 border-blue-200",
};

export function StatusBadge({ status }) {
  return (
    <Badge
      variant="outline"
      className={statusColors[status] || "bg-slate-100 text-slate-800 border-slate-200"}
    >
      {status}
    </Badge>
  );
}
