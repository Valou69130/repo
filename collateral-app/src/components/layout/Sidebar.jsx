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
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
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
      { key: "portfolio-opt", label: "Portfolio Optimisation", icon: TrendingUp },
    ],
  },
  {
    label: "Margin Calls",
    items: [
      { key: "agreements", label: "Agreements", icon: Scale },
      { key: "approvals", label: "Four-Eyes Approvals", icon: ShieldCheck },
      { key: "audit-export", label: "Audit Export", icon: FileText },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "operations", label: "Settlement / Ops", icon: ClipboardList },
      { key: "sftr-report", label: "SFTR Report", icon: FileBarChart },
      { key: "compliance", label: "Regulatory Compliance", icon: Scale },
      { key: "integration", label: "Integration Hub", icon: Link2 },
      { key: "parameters-rules", label: "Parameters & Rules", icon: Settings2 },
      { key: "audit", label: "Audit Trail", icon: FileText },
      { key: "notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "System",
    items: [
      { key: "admin", label: "Admin", icon: SlidersHorizontal },
    ],
  },
];

export function Sidebar({ current, setCurrent, notificationCount = 0 }) {
  return (
    <div className="w-60 flex-shrink-0 flex flex-col border-r border-slate-800/80 bg-slate-950">
      <div className="border-b border-slate-800/80 px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
            <Landmark className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">CollateralOS</div>
            <div className="text-[10px] text-slate-500">Romania Pilot</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {SECTIONS.map((section) => (
          <div key={section.label} className="mb-4">
            <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              {section.label}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = current === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setCurrent(item.key)}
                  className={`mx-2 flex w-[calc(100%-1rem)] items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                  }`}
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${active ? "text-blue-400" : "text-slate-500"}`} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.key === "notifications" && notificationCount > 0 && (
                    <span className="flex h-4 min-w-4 flex-shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {notificationCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
