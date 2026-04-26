import { useEffect, useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowUpRight, Bell, CheckCircle2, Clock3, Info, ShieldAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { KpiCard } from "@/components/shared/KpiCard";

// SLA windows per severity (hours)
const SLA_HOURS = { Critical: 2, Warning: 6, Info: 24 };

const SEVERITY_META = {
  Critical: {
    icon: AlertTriangle,
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
    badge: "bg-red-50 text-red-700 border-red-200",
    label: "Critical",
  },
  Warning: {
    icon: AlertCircle,
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    label: "Warning",
  },
  Info: {
    icon: Info,
    color: "text-blue-500",
    bg: "bg-blue-50 border-blue-200",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    label: "Info",
  },
};

function SlaTimer({ severity, createdAt }) {
  const slaHours = SLA_HOURS[severity] ?? 24;
  const [createdMs] = useState(() => (
    createdAt
      ? new Date(createdAt).getTime()
      : Date.now() - Math.random() * slaHours * 0.5 * 3600000
  ));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const deadlineMs = createdMs + slaHours * 3600000;
  const remainingMs = deadlineMs - now;
  const remainingH = Math.floor(remainingMs / 3600000);
  const remainingM = Math.floor((remainingMs % 3600000) / 60000);

  if (remainingMs <= 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-red-600 font-semibold">
        <Clock3 className="h-3 w-3" /> SLA OVERDUE
      </div>
    );
  }

  const urgent = remainingMs < slaHours * 0.25 * 3600000;
  return (
    <div className={`flex items-center gap-1 text-xs font-medium ${urgent ? "text-red-500" : "text-slate-400"}`}>
      <Clock3 className="h-3 w-3" />
      SLA: {remainingH > 0 ? `${remainingH}h ` : ""}{remainingM}m remaining
    </div>
  );
}

function NotificationCard({ n, onDismiss, onEscalate, onOpenRepo, acknowledged, escalated }) {
  const meta = SEVERITY_META[n.severity] ?? SEVERITY_META.Info;
  const Icon = meta.icon;

  return (
    <div className={`rounded border p-4 space-y-3 transition-opacity ${acknowledged ? "opacity-50" : ""} ${meta.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${meta.color}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`text-xs rounded ${meta.badge}`}>{meta.label}</Badge>
              {escalated && (
                <Badge variant="outline" className="text-xs rounded bg-purple-50 text-purple-700 border-purple-200">Escalated</Badge>
              )}
              {acknowledged && !escalated && (
                <Badge variant="outline" className="text-xs rounded bg-slate-50 text-slate-500 border-slate-200">Acknowledged</Badge>
              )}
            </div>
            <div className="text-sm font-medium text-slate-900 mt-1.5">{n.text}</div>
            {n.target && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs font-mono text-slate-400">{n.target}</span>
                {onOpenRepo && n.target.startsWith("R-") && (
                  <button onClick={() => onOpenRepo(n.target)}
                    className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-700">
                    <ArrowUpRight className="h-3 w-3" /> Open
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <button onClick={() => onDismiss(n.id)}
          className="text-slate-300 hover:text-slate-600 flex-shrink-0 mt-0.5 p-0.5">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <SlaTimer severity={n.severity} createdAt={n.createdAt} />
        <div className="flex items-center gap-2">
          {!acknowledged && !escalated && (
            <Button variant="outline" size="sm" className="rounded text-xs h-7"
              onClick={() => onEscalate(n.id, "acknowledged")}>
              <CheckCircle2 className="h-3 w-3 mr-1" /> Acknowledge
            </Button>
          )}
          {!escalated && n.severity !== "Info" && (
            <Button variant="outline" size="sm" className="rounded text-xs h-7 border-purple-200 text-purple-700 hover:bg-purple-50"
              onClick={() => onEscalate(n.id, "escalated")}>
              <ArrowUpRight className="h-3 w-3 mr-1" /> Escalate
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Notifications({ notifications, onDismissNotification, openRepo }) {
  const [statuses, setStatuses] = useState({}); // id -> "acknowledged" | "escalated"

  const handleAction = (id, action) => {
    setStatuses((prev) => ({ ...prev, [id]: action }));
  };

  const grouped = useMemo(() => {
    const order = ["Critical", "Warning", "Info"];
    return order
      .map((sev) => ({
        severity: sev,
        items: notifications.filter((n) => n.severity === sev),
      }))
      .filter((g) => g.items.length > 0);
  }, [notifications]);

  const critical = notifications.filter((n) => n.severity === "Critical").length;
  const acknowledged = Object.values(statuses).filter((s) => s === "acknowledged").length;
  const escalated   = Object.values(statuses).filter((s) => s === "escalated").length;

  // SLA breaches: critical items not yet acknowledged
  const slaBreaches = notifications.filter(
    (n) => n.severity === "Critical" && statuses[n.id] !== "acknowledged" && statuses[n.id] !== "escalated"
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
        <p className="mt-1 text-sm text-slate-500">Prioritise critical operational events and move from alert intake to acknowledgement or escalation.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Active Alerts" value={String(notifications.length)} description="Requiring attention" icon={Bell} alert={critical > 0} />
        <KpiCard title="Critical" value={String(critical)} description="Immediate action required" icon={AlertTriangle} alert={critical > 0} />
        <KpiCard title="SLA Breached" value={String(slaBreaches)} description="Critical items unacknowledged" icon={Clock3} alert={slaBreaches > 0} />
        <KpiCard title="Resolved This Session" value={String(acknowledged + escalated)} description={`${acknowledged} acknowledged · ${escalated} escalated`} icon={CheckCircle2} trendUp={acknowledged + escalated > 0} />
      </div>

      <Card className="rounded border-slate-200 shadow-sm">
        <CardContent className="grid gap-4 px-5 py-5 lg:grid-cols-[1.25fr,0.85fr]">
          <div className="rounded border border-slate-200 bg-slate-50/80 px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Response playbook
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              Treat critical margin, settlement, and limit events as fast-path items. Acknowledge to claim ownership, escalate when desk coordination is needed, and use repo deep-links to jump directly into the affected trade context.
            </div>
          </div>
          <div className="rounded border border-slate-200 bg-white px-4 py-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-medium">SLA windows</div>
            <div className="mt-3 grid gap-2">
              <div className="flex items-center justify-between rounded bg-red-50 px-3 py-2 text-sm">
                <span className="font-medium text-red-700">Critical</span>
                <span className="text-red-600">2h acknowledge</span>
              </div>
              <div className="flex items-center justify-between rounded bg-amber-50 px-3 py-2 text-sm">
                <span className="font-medium text-amber-700">Warning</span>
                <span className="text-amber-600">6h review</span>
              </div>
              <div className="flex items-center justify-between rounded bg-blue-50 px-3 py-2 text-sm">
                <span className="font-medium text-blue-700">Info</span>
                <span className="text-blue-600">24h review</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {notifications.length === 0 ? (
        <Card className="rounded shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-4" />
            <div className="font-semibold text-slate-700">All clear</div>
            <div className="text-sm text-slate-400 mt-1">No active notifications at this time.</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => {
            const meta = SEVERITY_META[group.severity];
            const Icon = meta.icon;
            return (
              <Card key={group.severity} className="rounded shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${meta.color}`} />
                    <CardTitle className="text-base">{group.severity} Alerts</CardTitle>
                    <Badge variant="outline" className={`text-xs rounded ml-1 ${meta.badge}`}>{group.items.length}</Badge>
                    {group.severity === "Critical" && (
                      <span className="ml-auto text-xs text-red-500 font-medium">SLA: 2h response required</span>
                    )}
                    {group.severity === "Warning" && (
                      <span className="ml-auto text-xs text-amber-500 font-medium">SLA: 6h response required</span>
                    )}
                  </div>
                  <CardDescription>
                    {group.severity === "Critical" && "Immediate action required — margin deficits, settlement failures, or limit breaches."}
                    {group.severity === "Warning" && "Attention required — upcoming maturities, elevated utilisation, or pending confirmations."}
                    {group.severity === "Info" && "Informational events — completed actions, system confirmations."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {group.items.map((n) => (
                    <NotificationCard
                      key={n.id}
                      n={n}
                      onDismiss={onDismissNotification}
                      onEscalate={handleAction}
                      onOpenRepo={(id) => { openRepo(id); }}
                      acknowledged={statuses[n.id] === "acknowledged"}
                      escalated={statuses[n.id] === "escalated"}
                    />
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Separator />

      {/* SLA policy reference */}
      <Card className="rounded border-dashed bg-slate-50">
        <CardContent className="p-4">
          <div className="text-xs text-slate-500 space-y-1.5">
            <div className="font-semibold text-slate-700 mb-2">SLA Policy — Internal Operations</div>
            <div className="grid gap-1 md:grid-cols-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5" />
                <span><span className="font-medium text-slate-700">Critical:</span> Acknowledge within 2h, resolve within 4h. Escalate to Head of Treasury if unresolved.</span>
              </div>
              <div className="flex items-start gap-2">
                <AlertCircle className="h-3 w-3 text-amber-500 mt-0.5" />
                <span><span className="font-medium text-slate-700">Warning:</span> Review within 6h, resolve before end of business day.</span>
              </div>
              <div className="flex items-start gap-2">
                <Info className="h-3 w-3 text-blue-400 mt-0.5" />
                <span><span className="font-medium text-slate-700">Info:</span> Review within 24h. No escalation required.</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
