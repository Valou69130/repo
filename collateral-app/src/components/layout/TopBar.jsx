import { useEffect, useRef, useState } from "react";
import { Bell, LogOut, RefreshCw, Search, X, AlertTriangle, Info, AlertCircle, Lock, FileText, ChevronDown, UserCheck } from "lucide-react";

const DEMO_ROLES = [
  { name: "Treasury Manager",   email: "treasury@banca-demo.ro" },
  { name: "Collateral Manager", email: "collateral@banca-demo.ro" },
  { name: "Operations Analyst", email: "operations@banca-demo.ro" },
  { name: "Risk Reviewer",      email: "risk@banca-demo.ro" },
];

const SEVERITY_ICON = {
  Critical: AlertTriangle,
  Warning: AlertCircle,
  Info: Info,
};
const SEVERITY_COLOR = {
  Critical: "text-red-400",
  Warning:  "text-amber-400",
  Info:     "text-blue-400",
};

function SearchResult({ result, onSelect }) {
  const typeColor = {
    repo: "text-blue-600 bg-blue-50",
    asset: "text-emerald-600 bg-emerald-50",
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

export function TopBar({
  notifications, role, onLogout, onDismissNotification, onReset,
  repos, assets, onNavigate, onEodLock, onSwitchRole,
}) {
  const [bellOpen, setBellOpen]   = useState(false);
  const [resetting, setResetting] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [roleOpen, setRoleOpen]   = useState(false);
  const [query, setQuery]         = useState("");
  const [eodLocking, setEodLocking] = useState(false);
  const [eodDone, setEodDone]     = useState(false);

  const bellRef   = useRef(null);
  const searchRef = useRef(null);
  const roleRef   = useRef(null);
  const inputRef  = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handle(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
      if (roleRef.current && !roleRef.current.contains(e.target)) setRoleOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    function handle(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") { setSearchOpen(false); setQuery(""); }
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);

  // Build search results
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
    // Counterparties from repos
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
    if (result.type === "repo")          onNavigate("repo-detail", result.id);
    else if (result.type === "asset")    onNavigate("inventory");
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

  return (
    <div className="flex items-center justify-between px-6 py-0 h-14 border-b border-slate-200/80 bg-white/95 backdrop-blur flex-shrink-0 gap-3">
      {/* Left: institution context */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 uppercase tracking-widest">Institution</span>
          <span className="text-sm font-semibold text-slate-900">Banca Demo Romania</span>
        </div>
        <div className="hidden h-4 w-px bg-slate-200 md:block" />
        <span className="hidden md:inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Demo live
        </span>
        <span className="hidden font-mono text-xs text-slate-500 xl:block">
          {new Date().toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      </div>

      {/* Centre: global search */}
      <div className="flex-1 max-w-md relative" ref={searchRef}>
        <button
          className="w-full flex items-center gap-2 h-10 px-3.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs text-slate-400 transition border border-transparent hover:border-slate-200"
          onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        >
          <Search className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1 text-left">Search repos, assets, counterparties…</span>
          <kbd className="text-[10px] bg-white border border-slate-200 rounded px-1 py-px font-mono hidden sm:block">⌘K</kbd>
        </button>

        {searchOpen && (
          <div className="absolute top-10 left-0 right-0 bg-white border border-slate-200 shadow-xl z-50 rounded overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
              <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search repos, assets, counterparties…"
                className="flex-1 text-sm outline-none bg-transparent text-slate-900 placeholder:text-slate-400"
              />
              {query && (
                <button onClick={() => setQuery("")} className="text-slate-300 hover:text-slate-500">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {query.length < 2 ? (
              <div className="px-3 py-3 text-xs text-slate-400">Type at least 2 characters to search…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400">No results for "{query}"</div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {results.map((r, i) => (
                  <SearchResult key={i} result={r} onSelect={handleSelect} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Role switcher */}
        <div className="relative mr-2" ref={roleRef}>
          <button
            className="flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-medium text-slate-600 hover:bg-slate-200 transition"
            onClick={() => setRoleOpen((o) => !o)}
            title="Switch demo role"
          >
            <UserCheck className="h-3 w-3 text-slate-400" />
            {role}
            <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${roleOpen ? "rotate-180" : ""}`} />
          </button>
          {roleOpen && (
            <div className="absolute right-0 top-9 w-52 bg-white border border-slate-200 shadow-lg z-50 rounded overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Switch demo role</span>
              </div>
              {DEMO_ROLES.map((r) => (
                <button
                  key={r.name}
                  className={`w-full text-left px-3 py-2.5 text-xs hover:bg-slate-50 transition flex items-center justify-between ${r.name === role ? "text-blue-700 font-semibold bg-blue-50" : "text-slate-700"}`}
                  onClick={() => { onSwitchRole?.(r); setRoleOpen(false); }}
                >
                  {r.name}
                  {r.name === role && <span className="text-[10px] text-blue-500">active</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* EoD Lock */}
        <button
          className={`h-9 px-3 flex items-center gap-1.5 text-xs rounded-xl transition disabled:opacity-40 ${
            eodDone
              ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
              : "text-slate-500 border border-transparent hover:text-slate-800 hover:bg-slate-100"
          }`}
          onClick={handleEodLock}
          disabled={eodLocking}
          title="Mark End-of-Day — confirm all positions and write audit snapshot"
        >
          {eodDone
            ? <><FileText className="h-3.5 w-3.5" /> EoD Confirmed</>
            : eodLocking
            ? <><Lock className="h-3.5 w-3.5 animate-pulse" /> Locking…</>
            : <><Lock className="h-3.5 w-3.5" /> EoD Lock</>}
        </button>

        {/* Bell */}
        <div className="relative" ref={bellRef}>
          <button
            className={`relative h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition ${critical > 0 ? "text-red-600" : "text-slate-500"}`}
            onClick={() => setBellOpen((o) => !o)}
          >
            <Bell className="h-4 w-4" />
            {notifications.length > 0 && (
              <span className={`absolute top-1 right-1 h-2 w-2 rounded-full ${critical > 0 ? "bg-red-500" : "bg-slate-400"}`} />
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 top-10 w-80 bg-white border border-slate-200 shadow-lg z-50 rounded">
              <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Notifications</span>
                {notifications.length > 0 && (
                  <button
                    className="text-xs text-blue-500 hover:text-blue-700"
                    onClick={() => { setBellOpen(false); onNavigate?.("notifications"); }}
                  >
                    View all
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="px-3 py-4 text-xs text-slate-400 text-center">No active alerts</div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {notifications.slice(0, 6).map((n) => {
                    const Icon = SEVERITY_ICON[n.severity] ?? Info;
                    return (
                      <div key={n.id} className="flex items-start gap-2.5 px-3 py-2.5">
                        <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${SEVERITY_COLOR[n.severity] ?? "text-slate-400"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-slate-800 leading-snug">{n.text}</div>
                          {n.target && <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{n.target}</div>}
                        </div>
                        <button onClick={() => onDismissNotification(n.id)}
                          className="p-0.5 text-slate-300 hover:text-slate-600 flex-shrink-0 mt-0.5">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reset */}
        <button
          className="h-9 rounded-xl px-3 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition disabled:opacity-40"
          onClick={handleReset}
          disabled={resetting}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`} />
          {resetting ? "Resetting…" : "Reset"}
        </button>

        {/* Logout */}
        <button
          className="h-9 w-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition"
          onClick={onLogout}
          title="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
