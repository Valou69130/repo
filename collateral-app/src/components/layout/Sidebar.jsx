import {
  Activity,
  ArrowRightLeft,
  BadgeCheck,
  Bell,
  BookMarked,
  Building2,
  ClipboardList,
  Download,
  FileBarChart,
  Gauge,
  History,
  Landmark,
  Layers,
  LayoutDashboard,
  Link2,
  Scale,
  Settings2,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
} from "lucide-react";

const SECTIONS = [
  {
    label: "Overview",
    items: [
      { key: "dashboard",     label: "Dashboard",     icon: LayoutDashboard },
      { key: "business-case", label: "Business Case", icon: TrendingUp },
    ],
  },
  {
    label: "Collateral",
    items: [
      { key: "inventory",        label: "Collateral Inventory",  icon: Wallet },
      { key: "counterparties",   label: "Counterparty Monitor",  icon: Building2 },
      { key: "digital-positions",label: "Digital Positions",     icon: Layers },
    ],
  },
  {
    label: "Trading",
    items: [
      { key: "repos",         label: "Repo Transactions",      icon: ArrowRightLeft },
      { key: "margin",        label: "Margin Monitor",         icon: Activity },
      { key: "portfolio-opt", label: "Portfolio Optimisation", icon: Gauge },
    ],
  },
  {
    label: "Margin Calls",
    items: [
      { key: "agreements",  label: "Agreements",          icon: Scale },
      { key: "approvals",   label: "Four-Eyes Approvals", icon: BadgeCheck },
      { key: "audit-export",label: "Audit Export",        icon: Download },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "operations",       label: "Settlement / Ops",      icon: ClipboardList },
      { key: "sftr-report",      label: "SFTR Report",           icon: FileBarChart },
      { key: "compliance",       label: "Regulatory Compliance", icon: BookMarked },
      { key: "integration",      label: "Integration Hub",       icon: Link2 },
      { key: "parameters-rules", label: "Parameters & Rules",    icon: Settings2 },
      { key: "audit",            label: "Audit Trail",           icon: History },
      { key: "notifications",    label: "Notifications",         icon: Bell },
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
    <div className="w-[220px] flex-shrink-0 flex flex-col border-r border-slate-800/60 bg-[#0a0f1e]">
      {/* Brand */}
      <div className="border-b border-slate-800/60 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center bg-blue-600">
            <Landmark className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-[13px] font-semibold tracking-tight text-white">CollateralOS</div>
            <div className="text-[10px] font-medium text-blue-400/70 tracking-wide">EU Pilot · Romania</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {SECTIONS.map((section) => (
          <div key={section.label} className="mb-1">
            <div className="px-4 pb-1 pt-3 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-600">
              {section.label}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = current === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setCurrent(item.key)}
                  className={`group relative flex w-full items-center gap-2.5 border-l-2 px-4 py-2.5 text-left transition-colors duration-100 ${
                    active
                      ? "border-l-blue-500 bg-white/5 text-white"
                      : "border-l-transparent text-slate-400 hover:bg-white/5 hover:text-slate-100"
                  }`}
                >
                  <Icon className={`h-[14px] w-[14px] flex-shrink-0 transition-colors ${active ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"}`} />
                  <span className="flex-1 truncate text-[12px] font-[450]">{item.label}</span>
                  {item.key === "notifications" && notificationCount > 0 && (
                    <span className="flex h-4 min-w-[16px] flex-shrink-0 items-center justify-center bg-red-500 px-1 text-[9px] font-bold text-white">
                      {notificationCount > 9 ? "9+" : notificationCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-800/60 px-4 py-3">
        <div className="text-[10px] text-slate-600 tabular-nums">
          {new Date().toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" })}
        </div>
      </div>
    </div>
  );
}
