import { useEffect, useRef, useState } from "react";
import { Bell, LogOut, Search, X, AlertTriangle, Info, AlertCircle, Lock, FileText, ChevronDown, RefreshCw, BookOpen, UserCheck } from "lucide-react";

const SEVERITY_ICON = {
  Critical: AlertTriangle,
  Warning:  AlertCircle,
  Info:     Info,
};
const SEVERITY_COLOR = {
  Critical: "text-red-400",
  Warning:  "text-amber-400",
  Info:     "text-blue-400",
};
const SEVERITY_BG = {
  Critical: "bg-red-50 border-red-100",
  Warning:  "bg-amber-50 border-amber-100",
  Info:     "bg-blue-50 border-blue-100",
};

const DEMO_ROLES = [
  { name: "Treasury Manager",   email: "treasury@banca-demo.ro" },
  { name: "Collateral Manager", email: "collateral@banca-demo.ro" },
  { name: "Operations Analyst", email: "operations@banca-demo.ro" },
  { name: "Risk Reviewer",      email: "risk@banca-demo.ro" },
];

function SearchResult({ result, onSelect }) {
  const typeColor = {
    repo:         "text-blue-600 bg-blue-50",
    asset:        "text-emerald-600 bg-emerald-50",
    counterparty: "text-purple-600 bg-purple-50",
  };
  return (
    <button
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left transition-colors border-b border-slate-100 last:border-0"
      onClick={() => onSelect(result)}
    >
      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${typeColor[result.type]}`}>
        {result.type}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-800 truncate">{result.title}</div>
        <div className="text-xs text-slate-400 truncate">{result.subtitle}</div>
      </div>
    </button>
  );
}

// Role initials helper
function initials(name) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export function TopBar({
  notifications, role, onLogout, onDismissNotification, onReset,
  repos, assets, onNavigate, onEodLock, onSwitchRole, onStartTour,
}) {
  const [bellOpen, setBellOpen]     = useState(false);
  const [resetting, setResetting]   = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [query, setQuery]           = useState("");
  const [eodLocking, setEodLocking] = useState(false);
  const [eodDone, setEodDone]       = useState(false);

  const searchRef  = useRef(null);
  const profileRef = useRef(null);
  const inputRef   = useRef(null);

  useEffect(() => {
    function handle(e) {
      if (searchRef.current  && !searchRef.current.contains(e.target))  setSearchOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => {
    function handle(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") { setSearchOpen(false); setQuery(""); setBellOpen(false); setProfileOpen(false); }
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);

  const results = (() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const out = [];
    for (const r of repos ?? []) {
      if ([r.id, r.counterparty, r.state].join(" ").toLowerCase().includes(q)) {
        out.push({ type: "repo", id: r.id, title: `${r.id} — ${r.counterparty}`, subtitle: `${r.state} · ${r.amount?.toLocaleString()} ${r.currency} · ${r.maturityDate}` });
      }
    }
    for (const a of assets ?? []) {
      if ([a.name, a.isin, a.issuer, a.type].join(" ").toLowerCase().includes(q)) {
        out.push({ type: "asset", id: a.id, title: a.name, subtitle: `${a.isin} · ${a.status} · ${a.custody}` });
      }
    }
    const cpSet = new Set((repos ?? []).map((r) => r.counterparty));
    for (const cp of cpSet) {
      if (cp.toLowerCase().includes(q)) {
        const cpRepos = (repos ?? []).filter((r) => r.counterparty === cp && r.state !== "Closed");
        out.push({ type: "counterparty", id: cp, title: cp, subtitle: `${cpRepos.length} active repo${cpRepos.length !== 1 ? "s" : ""}` });
      }
    }
    return out.slice(0, 8);
  })();

  const handleSelect = (result) => {
    setSearchOpen(false);
    setQuery("");
    if (!onNavigate) return;
    if (result.type === "repo")              onNavigate("repo-detail", result.id);
    else if (result.type === "asset")        onNavigate("inventory");
    else if (result.type === "counterparty") onNavigate("counterparties");
  };

  const handleReset = async () => {
    if (!confirm("Reset all demo data to the initial state?")) return;
    setResetting(true);
    try { await onReset(); } finally { setResetting(false); }
  };

  const handleEodLock = async () => {
    if (!confirm("Mark all current positions as End-of-Day confirmed and write snapshot to audit trail?")) return;
    setEodLocking(true);
    try { await onEodLock?.(); setEodDone(true); setTimeout(() => setEodDone(false), 4000); }
    finally { setEodLocking(false); }
  };

  const critical = notifications.filter((n) => n.severity === "Critical").length;
  const unread   = notifications.length;

  return (
    <>
      {/* ── Notification drawer ─────────────────────────────────────────── */}
      {bellOpen && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setBellOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-[1px]" />
          <div
            className="relative z-50 w-96 h-full bg-white shadow-2xl flex flex-col border-l border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Bell className={`h-4 w-4 ${critical > 0 ? "text-red-500" : "text-slate-500"}`} />
                <span className="font-semibold text-slate-900 text-sm">Notifications</span>
                {unread > 0 && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${critical > 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                    {unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button className="text-xs text-blue-600 hover:text-blue-800 font-medium" onClick={() => { setBellOpen(false); onNavigate?.("notifications"); }}>
                  View all
                </button>
                <button onClick={() => setBellOpen(false)} className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400">
                  <Bell className="h-8 w-8 opacity-30" />
                  <span className="text-sm">No active alerts</span>
                </div>
              ) : (
                notifications.map((n) => {
                  const Icon = SEVERITY_ICON[n.severity] ?? Info;
                  return (
                    <div key={n.id} className={`flex items-start gap-3 px-5 py-4 ${SEVERITY_BG[n.severity] ?? ""}`}>
                      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${SEVERITY_COLOR[n.severity] ?? "text-slate-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-800 leading-snug font-medium">{n.text}</div>
                        {n.target && <div className="text-[11px] text-slate-400 mt-1 font-mono">{n.target}</div>}
                      </div>
                      <button onClick={() => onDismissNotification(n.id)} className="p-1 text-slate-300 hover:text-slate-600 flex-shrink-0 rounded hover:bg-white/60 transition">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            {notifications.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
                <button className="text-xs text-slate-500 hover:text-slate-700 transition" onClick={() => { setBellOpen(false); onNavigate?.("notifications"); }}>
                  Manage all notifications →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TopBar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 h-14 border-b border-slate-200/70 bg-white flex-shrink-0 gap-4 relative z-30">

        {/* Left: institution + status */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[13px] font-semibold text-slate-800 tracking-tight">Banca Demo Romania</span>
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-sm bg-emerald-500" />
            Connected
          </span>
          {/* EoD Lock — real banking function, stays visible */}
          <div className="hidden h-4 w-px bg-slate-200 xl:block" />
          <button
            className={`hidden xl:flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition disabled:opacity-40 ${
              eodDone
                ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                : "text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-700 hover:bg-slate-50"
            }`}
            onClick={handleEodLock}
            disabled={eodLocking}
            title="Mark End-of-Day — confirm all positions and write audit snapshot"
          >
            {eodDone
              ? <><FileText className="h-3 w-3" /> EoD Confirmed</>
              : eodLocking
              ? <><Lock className="h-3 w-3 animate-pulse" /> Locking…</>
              : <><Lock className="h-3 w-3" /> EoD Lock</>}
          </button>
        </div>

        {/* Centre: search */}
        <div className="flex-1 max-w-lg relative" ref={searchRef}>
          <button
            className="w-full flex items-center gap-2 h-9 px-3.5 bg-slate-50 hover:bg-slate-100 rounded text-xs text-slate-400 transition border border-slate-200/80 hover:border-slate-300"
            onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
          >
            <Search className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1 text-left">Search entity, LEI, ISIN, repo ID…</span>
            <kbd className="text-[10px] bg-white border border-slate-200 rounded px-1 py-px font-mono hidden sm:block">⌘K</kbd>
          </button>
          {searchOpen && (
            <div className="absolute top-10 left-0 right-0 bg-white border border-slate-200 shadow-xl z-50 rounded overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100">
                <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search entity, LEI, ISIN, repo ID…"
                  className="flex-1 text-sm outline-none bg-transparent text-slate-900 placeholder:text-slate-400"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="text-slate-300 hover:text-slate-500">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {query.length < 2 ? (
                <div className="px-3 py-3 text-xs text-slate-400">Type at least 2 characters…</div>
              ) : results.length === 0 ? (
                <div className="px-3 py-3 text-xs text-slate-400">No results for "{query}"</div>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  {results.map((r, i) => <SearchResult key={i} result={r} onSelect={handleSelect} />)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: bell + user profile */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Bell */}
          <button
            className={`relative h-9 w-9 flex items-center justify-center rounded hover:bg-slate-100 transition ${critical > 0 ? "text-red-500" : "text-slate-500"}`}
            onClick={() => setBellOpen((o) => !o)}
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className={`absolute top-1.5 right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[8px] font-bold text-white ${critical > 0 ? "bg-red-500" : "bg-slate-500"}`}>
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {/* User profile */}
          <div className="relative ml-1" ref={profileRef}>
            <button
              className="flex items-center gap-2 h-9 pl-1 pr-2.5 rounded hover:bg-slate-100 transition"
              onClick={() => setProfileOpen((o) => !o)}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-slate-800 text-[11px] font-bold text-white flex-shrink-0">
                {initials(role)}
              </div>
              <span className="hidden md:block text-[12px] font-medium text-slate-700 max-w-[120px] truncate">{role}</span>
              <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-11 w-64 bg-white border border-slate-200 shadow-xl z-50 rounded overflow-hidden">
                {/* User info header */}
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-slate-800 text-[13px] font-bold text-white flex-shrink-0">
                      {initials(role)}
                    </div>
                    <div>
                      <div className="text-[13px] font-semibold text-slate-800">{role}</div>
                      <div className="text-[11px] text-slate-400">Banca Demo Romania</div>
                    </div>
                  </div>
                </div>

                {/* Role switcher */}
                <div className="px-3 py-1.5 border-b border-slate-100">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 pb-1">Switch role</div>
                  {DEMO_ROLES.map((r) => (
                    <button
                      key={r.name}
                      className={`w-full text-left px-2 py-2 text-xs rounded-md transition flex items-center justify-between ${r.name === role ? "text-blue-700 font-semibold bg-blue-50" : "text-slate-600 hover:bg-slate-50"}`}
                      onClick={() => { onSwitchRole?.(r); setProfileOpen(false); }}
                    >
                      {r.name}
                      {r.name === role && <span className="h-1.5 w-1.5 rounded-sm bg-blue-500" />}
                    </button>
                  ))}
                </div>

                {/* Actions */}
                <div className="px-3 py-2">
                  <button
                    className="w-full flex items-center gap-2 px-2 py-2 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-md transition"
                    onClick={() => { setProfileOpen(false); onStartTour?.(); }}
                  >
                    <BookOpen className="h-3.5 w-3.5" /> Guided tour
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-2 py-2 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-md transition disabled:opacity-40"
                    onClick={() => { setProfileOpen(false); handleReset(); }}
                    disabled={resetting}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`} />
                    {resetting ? "Resetting…" : "Reset demo data"}
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-2 py-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md transition"
                    onClick={() => { setProfileOpen(false); onLogout?.(); }}
                  >
                    <LogOut className="h-3.5 w-3.5" /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
