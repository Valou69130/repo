export const auditSeed = [
  // ── March 24 — R-1008 lifecycle ──────────────────────────────────────────
  { ts: "2026-03-24 08:45", user: "Treasury Manager",   role: "Treasury",    action: "repo created",         object: "R-1008", prev: "Draft",              next: "Active",              comment: "Overnight repo with Carpathia Bank. RON 7.5M at 4.95%." },
  { ts: "2026-03-24 08:51", user: "Collateral Manager", role: "Collateral",  action: "allocation approved",  object: "R-1008", prev: "No collateral",       next: "RO1830DBN022 allocated", comment: "Single bond line approved. Coverage 104%." },
  { ts: "2026-03-24 09:05", user: "Operations Analyst", role: "Operations",  action: "settlement confirmed", object: "R-1008", prev: "Awaiting confirmation", next: "Confirmed",           comment: "SaFIR RTGS confirmation received." },
  { ts: "2026-03-25 09:10", user: "Collateral Manager", role: "Collateral",  action: "collateral released",  object: "R-1008", prev: "Active",              next: "Closed",              comment: "Repo matured. Govie returned to available pool." },
  // ── March 28 — R-1011 lifecycle ──────────────────────────────────────────
  { ts: "2026-03-28 09:00", user: "Treasury Manager",   role: "Treasury",    action: "repo created",         object: "R-1011", prev: "Draft",              next: "Active",              comment: "EUR overnight repo with Balkan Treasury House. EUR 5M at 3.25%." },
  { ts: "2026-03-28 09:08", user: "Collateral Manager", role: "Collateral",  action: "allocation approved",  object: "R-1011", prev: "No collateral",       next: "LU0290358497 allocated", comment: "EUR MMF unit used as collateral. Euroclear delivery confirmed." },
  { ts: "2026-03-28 09:20", user: "Operations Analyst", role: "Operations",  action: "settlement confirmed", object: "R-1011", prev: "Awaiting confirmation", next: "Confirmed",           comment: "Euroclear settlement match confirmed via SWIFT MT548." },
  { ts: "2026-03-29 09:05", user: "Operations Analyst", role: "Operations",  action: "collateral released",  object: "R-1011", prev: "Active",              next: "Closed",              comment: "Overnight unwind. EUR MMF released back to custody." },
  // ── March 31 — R-1018 open ───────────────────────────────────────────────
  { ts: "2026-03-31 10:15", user: "Treasury Manager",   role: "Treasury",    action: "repo created",         object: "R-1018", prev: "Draft",              next: "Active",              comment: "Carpathia Bank term repo. RON 6M at 5.05%. T-bill collateral." },
  { ts: "2026-03-31 10:22", user: "Collateral Manager", role: "Collateral",  action: "allocation approved",  object: "R-1018", prev: "No collateral",       next: "ROTBILL2026X allocated", comment: "T-bill basket approved. Coverage 105.3%." },
  // ── April 1 — R-1021 and R-1024 open ────────────────────────────────────
  { ts: "2026-04-01 09:12", user: "Treasury Manager",   role: "Treasury",    action: "repo created",         object: "R-1024", prev: "Draft",              next: "Approved",            comment: "Trade terms captured and submitted." },
  { ts: "2026-04-01 09:18", user: "Collateral Manager", role: "Collateral",  action: "allocation approved",  object: "R-1024", prev: "No collateral",       next: "AST-005 allocated",   comment: "Basket approved with single bond line." },
  { ts: "2026-04-01 09:22", user: "Operations Analyst", role: "Operations",  action: "settlement confirmed", object: "R-1021", prev: "Awaiting confirmation", next: "Confirmed",           comment: "Custody confirmation received." },
  { ts: "2026-04-01 09:30", user: "Treasury Manager",   role: "Treasury",    action: "repo created",         object: "R-1021", prev: "Draft",              next: "Active",              comment: "UniBank overnight RON 10M at 5.15%. Govie collateral." },
  { ts: "2026-04-01 09:38", user: "Collateral Manager", role: "Collateral",  action: "allocation approved",  object: "R-1021", prev: "No collateral",       next: "RO1827DBN011 allocated", comment: "Romania 2028 govie. Coverage 105.4%." },
  { ts: "2026-04-01 11:05", user: "Risk Reviewer",      role: "Risk",        action: "margin alert triggered", object: "R-1024", prev: "In compliance",    next: "Margin deficit",      comment: "Recalculation identified collateral shortfall." },
  // ── April 5 — R-1026 open ────────────────────────────────────────────────
  { ts: "2026-04-05 09:55", user: "Treasury Manager",   role: "Treasury",    action: "repo created",         object: "R-1026", prev: "Draft",              next: "Active",              comment: "UniBank 7-day term RON 12M at 5.20%." },
  { ts: "2026-04-05 10:02", user: "Collateral Manager", role: "Collateral",  action: "allocation approved",  object: "R-1026", prev: "No collateral",       next: "RO1827DBN033 allocated", comment: "Romania 2027 govie. Coverage 104.5%." },
  { ts: "2026-04-05 10:15", user: "Operations Analyst", role: "Operations",  action: "settlement confirmed", object: "R-1026", prev: "Awaiting confirmation", next: "Confirmed",           comment: "SaFIR RTGS settlement confirmed." },
  // ── April 6 — margin recalc and SFTR ─────────────────────────────────────
  { ts: "2026-04-06 07:50", user: "Risk Reviewer",      role: "Risk",        action: "margin recalculation", object: "R-1024", prev: "Margin deficit",     next: "Margin deficit",      comment: "Daily MTM reconfirms deficit of RON 390,000. Top-up required." },
  { ts: "2026-04-06 08:30", user: "Collateral Manager", role: "Collateral",  action: "SFTR report generated", object: "SFTR-2026-04-05", prev: "Draft",     next: "Submitted",           comment: "T+1 SFTR report for 2026-04-05 submitted to DTCC." },
  { ts: "2026-04-06 08:35", user: "Operations Analyst", role: "Operations",  action: "recon exception logged", object: "R-1024", prev: "Matched",          next: "Unmatched",           comment: "AST-005 price divergence vs counterparty mark. Under review." },
  // ── April 7 — R-1025 BNR open ────────────────────────────────────────────
  { ts: "2026-04-07 09:00", user: "Treasury Manager",   role: "Treasury",    action: "repo created",         object: "R-1025", prev: "Draft",              next: "Active",              comment: "BNR weekly open market operation. RON 15M at 5.00%." },
  { ts: "2026-04-07 09:12", user: "Collateral Manager", role: "Collateral",  action: "allocation approved",  object: "R-1025", prev: "No collateral",       next: "AST-007+AST-010 allocated", comment: "2-asset basket: Romania 2030 govie + T-bill. Coverage 104.8%." },
  { ts: "2026-04-07 09:25", user: "Operations Analyst", role: "Operations",  action: "settlement confirmed", object: "R-1025", prev: "Awaiting confirmation", next: "Confirmed",           comment: "BNR ROMIT delivery confirmed." },
  // ── April 8 — R-1027 EUR open ────────────────────────────────────────────
  { ts: "2026-04-08 08:10", user: "Treasury Manager",   role: "Treasury",    action: "repo created",         object: "R-1027", prev: "Draft",              next: "Active",              comment: "EUR 2-day repo Danube Capital EUR 4M at 3.15%." },
  { ts: "2026-04-08 08:18", user: "Collateral Manager", role: "Collateral",  action: "allocation approved",  object: "R-1027", prev: "No collateral",       next: "OAT+Bund allocated",  comment: "French OAT and German Bund basket. Coverage 105%." },
  { ts: "2026-04-08 08:30", user: "Operations Analyst", role: "Operations",  action: "settlement confirmed", object: "R-1027", prev: "Awaiting confirmation", next: "Confirmed",           comment: "Euroclear SWIFT MT548 confirmation received." },
  // ── April 9 — SFTR + password change ─────────────────────────────────────
  { ts: "2026-04-09 08:30", user: "Collateral Manager", role: "Collateral",  action: "SFTR report generated", object: "SFTR-2026-04-08", prev: "Draft",     next: "Submitted",           comment: "T+1 SFTR report for 2026-04-08. 4 transactions reported." },
  { ts: "2026-04-09 11:40", user: "Collateral Manager", role: "Collateral",  action: "password changed",     object: "collateral@banca-demo.ro", prev: "Temporary", next: "Active",      comment: "User completed first-login password change." },
  // ── April 11 — EoD snapshot ───────────────────────────────────────────────
  { ts: "2026-04-11 17:01", user: "Treasury Manager",   role: "Treasury",    action: "EoD position snapshot", object: "ALL", prev: "Intraday",            next: "EoD confirmed",       comment: "End-of-day lock confirmed. 5 active repos, total RON 51M + EUR 4M." },
];
