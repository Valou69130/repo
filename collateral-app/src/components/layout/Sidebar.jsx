import {
  ArrowRightLeft,
  Bell,
  Building2,
  ClipboardList,
  FileBarChart,
  FileText,
  Landmark,
  Layers,
  LayoutDashboard,
  Link2,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";

const SECTIONS = [
  {
    label: "Overview",
    items: [
      { key: "dashboard",      label: "Dashboard",     icon: LayoutDashboard },
      { key: "business-case",  label: "Business Case", icon: TrendingUp       },
    ],
  },
  {
    label: "Collateral",
    items: [
      { key: "inventory", label: "Collateral Inventory", icon: Wallet },
      { key: "counterparties", label: "Counterparty Monitor", icon: Building2 },
      { key: "digital-positions", label: "Digital Positions", icon: Layers },
    ],
  },
  {
    label: "Trading",
    items: [
      { key: "repos", label: "Repo Transactions", icon: ArrowRightLeft },
      { key: "margin", label: "Margin Monitor", icon: ShieldCheck },
      { key: "portfolio-opt", label: "Portfolio Optimisation", icon: Sparkles },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "operations", label: "Settlement / Ops", icon: ClipboardList },
      { key: "sftr-report", label: "SFTR Report", icon: FileBarChart },
      { key: "compliance", label: "Regulatory Compliance", icon: Scale },
      { key: "integration", label: "Integration Hub", icon: Link2 },
      { key: "audit", label: "Audit Trail", icon: FileText },
      { key: "notifications", label: "Notifications", icon: Bell },
    ],
  },
];

export function Sidebar({ current, setCurrent, notificationCount = 0 }) {
  return (
    <div className="w-64 flex-shrink-0 flex flex-col border-r border-slate-800/80 bg-[linear-gradient(180deg,#020617_0%,#0f172a_42%,#111827_100%)]">
      <div className="border-b border-slate-800/80 px-5 py-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-slate-950/30">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-600 p-2 shadow-lg shadow-blue-600/25">
              <Landmark className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight tracking-[0.14em] text-white">CollateralOS</div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Romania Pilot</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Mode</div>
              <div className="mt-1 text-xs font-semibold text-white">Demo Live</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Build</div>
              <div className="mt-1 text-xs font-semibold text-white">2026.04</div>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            <div className="px-5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              {section.label}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = current === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setCurrent(item.key)}
                  className={`mx-3 flex w-[calc(100%-1.5rem)] items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-all ${
                    active
                      ? "bg-white/10 text-white shadow-lg shadow-slate-950/20 ring-1 ring-white/8"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                    active ? "bg-blue-500/20 text-blue-200" : "bg-slate-800/70 text-slate-500"
                  }`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="flex-1 truncate font-medium">{item.label}</span>
                  {item.key === "notifications" && notificationCount > 0 && (
                    <span className="flex h-[18px] min-w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {notificationCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-800/80 px-5 py-4">
        <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-600">Workspace</div>
          <div className="mt-1 text-xs font-medium text-slate-300">Treasury control surface</div>
        </div>
      </div>
    </div>
  );
}
