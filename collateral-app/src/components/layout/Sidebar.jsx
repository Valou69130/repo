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
  Wallet,
} from "lucide-react";

const SECTIONS = [
  {
    label: "Overview",
    items: [
      { key: "dashboard",      label: "Dashboard",            icon: LayoutDashboard },
    ],
  },
  {
    label: "Collateral",
    items: [
      { key: "inventory",      label: "Collateral Inventory", icon: Wallet },
      { key: "counterparties", label: "Counterparty Monitor", icon: Building2 },
      { key: "digital-positions", label: "Digital Positions", icon: Layers },
    ],
  },
  {
    label: "Trading",
    items: [
      { key: "repos",          label: "Repo Transactions",    icon: ArrowRightLeft },
      { key: "margin",         label: "Margin Monitor",       icon: ShieldCheck },
      { key: "portfolio-opt",  label: "Portfolio Optimisation", icon: Sparkles },
    ],
  },
  {
    label: "Operations",
    items: [
      { key: "operations",     label: "Settlement / Ops",     icon: ClipboardList },
      { key: "sftr-report",    label: "SFTR Report",          icon: FileBarChart },
      { key: "compliance",     label: "Regulatory Compliance",icon: Scale },
      { key: "integration",    label: "Integration Hub",      icon: Link2 },
      { key: "audit",          label: "Audit Trail",          icon: FileText },
      { key: "notifications",  label: "Notifications",        icon: Bell },
    ],
  },
];

export function Sidebar({ current, setCurrent, notificationCount = 0 }) {
  return (
    <div className="w-56 bg-slate-900 flex-shrink-0 flex flex-col">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="bg-blue-600 p-1.5 rounded">
            <Landmark className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-white text-sm font-semibold leading-tight tracking-tight">Collateral OS</div>
            <div className="text-slate-500 text-[11px] tracking-wide uppercase">Romania Pilot</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {SECTIONS.map((section) => (
          <div key={section.label} className="mb-4">
            <div className="px-4 py-1 text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
              {section.label}
            </div>
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = current === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setCurrent(item.key)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${
                    active
                      ? "bg-slate-800 text-white border-l-2 border-blue-500"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border-l-2 border-transparent"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="font-medium truncate flex-1">{item.label}</span>
                  {item.key === "notifications" && notificationCount > 0 && (
                    <span className="flex-shrink-0 text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                      {notificationCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-800">
        <div className="text-[10px] text-slate-600 uppercase tracking-widest">Build 2026.04</div>
      </div>
    </div>
  );
}
