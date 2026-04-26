import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { adjustedValue } from "@/domain/format";
import { getPermissions } from "@/domain/permissions";
import { api } from "@/integrations/api";
import { useIntegration } from "@/hooks/useIntegration";
import { useAgentRunner } from "@/workflows/hooks/useAgentRunner";
import { useMarketFeed }  from "@/hooks/useMarketFeed";
import { DomainProvider, useDomain, useDispatch } from "@/domain/store";
import { ChangePasswordModal } from "@/components/shared/ChangePasswordModal";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { WelcomeModal, TourOverlay } from "@/components/shared/OnboardingTour";
import { COUNTERPARTY_PROFILES } from "@/domain/counterparties";

function lazyNamed(loader, exportName) {
  return lazy(() => loader().then((module) => ({ default: module[exportName] })));
}

const Login = lazyNamed(() => import("@/pages/Login"), "Login");
const PrivacyPolicy = lazyNamed(() => import("@/pages/PrivacyPolicy"), "PrivacyPolicy");
const Dashboard = lazyNamed(() => import("@/pages/Dashboard"), "Dashboard");
const Inventory = lazyNamed(() => import("@/pages/Inventory"), "Inventory");
const Repos = lazyNamed(() => import("@/pages/Repos"), "Repos");
const Margin = lazyNamed(() => import("@/pages/Margin"), "Margin");
const Operations = lazyNamed(() => import("@/pages/Operations"), "Operations");
const AuditTrail = lazyNamed(() => import("@/pages/AuditTrail"), "AuditTrail");
const RepoDetail = lazyNamed(() => import("@/pages/RepoDetail"), "RepoDetail");
const DigitalPositions = lazyNamed(() => import("@/pages/DigitalPositions"), "DigitalPositions");
const SFTRReport = lazyNamed(() => import("@/pages/SFTRReport"), "SFTRReport");
const CounterpartyMonitor = lazyNamed(() => import("@/pages/CounterpartyMonitor"), "CounterpartyMonitor");
const Notifications = lazyNamed(() => import("@/pages/Notifications"), "Notifications");
const RegulatoryCompliance = lazyNamed(() => import("@/pages/RegulatoryCompliance"), "RegulatoryCompliance");
const IntegrationHub = lazyNamed(() => import("@/pages/IntegrationHub"), "IntegrationHub");
const PortfolioOptimisation = lazyNamed(() => import("@/pages/PortfolioOptimisation"), "PortfolioOptimisation");
const BusinessCase = lazyNamed(() => import("@/pages/BusinessCase"), "BusinessCase");
const ParametersRules = lazyNamed(() => import("@/pages/ParametersRules"), "ParametersRules");
const Agreements = lazyNamed(() => import("@/pages/Agreements"), "Agreements");
const AgreementDetail = lazyNamed(() => import("@/pages/AgreementDetail"), "AgreementDetail");
const MarginCallDetail = lazyNamed(() => import("@/pages/MarginCallDetail"), "MarginCallDetail");
const Approvals = lazyNamed(() => import("@/pages/Approvals"), "Approvals");
const AuditExport = lazyNamed(() => import("@/pages/AuditExport"), "AuditExport");
const Admin = lazyNamed(() => import("@/pages/Admin"), "Admin");

function PageFallback() {
  return (
    <div className="min-h-[240px] flex items-center justify-center text-sm text-slate-500">
      Loading view...
    </div>
  );
}

export default function App() {
  return (
    <DomainProvider>
      <AppContent />
    </DomainProvider>
  );
}

function AppContent() {
  const state    = useDomain();
  const dispatch = useDispatch();

  const { user, assets, repos, audit, notifications, loading, ruleEngine, marketLive } = state;

  const [current, setCurrent]                   = useState("dashboard");
  const [selectedAsset, setSelectedAsset]       = useState(null);
  const [selectedRepoId, setSelectedRepoId]     = useState(null);
  const [selectedAgreementId, setSelectedAgreementId] = useState(null);
  const [selectedMarginCallId, setSelectedMarginCallId] = useState(null);
  const [apiError, setApiError]                 = useState(false);
  const [pendingSubstitutions, setPendingSubstitutions] = useState([]);
  const [showWelcome, setShowWelcome]           = useState(false);
  const [tourActive, setTourActive]             = useState(false);
  const [authChecked, setAuthChecked]           = useState(false);

  // Rehydrate auth state from session cookie on every page load/reload
  useEffect(() => {
    const stored = localStorage.getItem('co_user');
    if (stored) {
      try { dispatch({ type: 'USER_LOGGED_IN', payload: JSON.parse(stored) }); } catch {}
    }
    api.me()
      .then(data => { if (data?.user) dispatch({ type: 'USER_LOGGED_IN', payload: data.user }); })
      .catch(() => { localStorage.removeItem('co_user'); })
      .finally(() => setAuthChecked(true));
  }, [dispatch]);

  const openAgreement = (id) => { setSelectedAgreementId(id); setCurrent("agreement-detail"); };
  const openMarginCall = (id) => { setSelectedMarginCallId(id); setCurrent("margin-call-detail"); };

  const role = user?.role || "Treasury Manager";
  const permissions = getPermissions(role);

  const loadData = useCallback(async () => {
    dispatch({ type: "LOAD_STARTED" });
    try {
      const [a, r, n, au, re] = await Promise.all([
        api.getAssets(),
        api.getRepos(),
        api.getNotifications(),
        api.getAudit(),
        api.getRuleEngine(),
      ]);
      dispatch({
        type: "LOAD_SUCCESS",
        payload: { assets: a, repos: r, notifications: n, audit: au, ruleEngine: re },
      });
      setApiError(false);
    } catch (err) {
      console.error("Failed to load data:", err);
      dispatch({ type: "LOAD_FAILED", payload: err?.message ?? "Failed to load" });
      setApiError(true);
    }
  }, [dispatch]);

  useEffect(() => {
    // This effect intentionally synchronizes domain state with the authenticated user session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) loadData();
  }, [user, loadData]);

  const handleLogout = async () => {
    await api.logout().catch(() => {});
    dispatch({ type: "USER_LOGGED_OUT" });
  };

  const handleSwitchRole = ({ name, email }) => {
    const switched = { ...user, name, email, role: name };
    localStorage.setItem("co_user", JSON.stringify(switched));
    dispatch({ type: "USER_LOGGED_IN", payload: switched });
  };

  const selectedRepo = repos.find((r) => r.id === selectedRepoId) || null;

  const openRepo = (repoId) => {
    setSelectedRepoId(repoId);
    setCurrent("repo-detail");
  };

  const appendAudit = (entry) => {
    dispatch({ type: "AUDIT_APPENDED", payload: entry });
    api.addAudit(entry).catch(console.error);
  };

  const dismissNotification = (id) => {
    dispatch({ type: "NOTIFICATION_DISMISSED", payload: id });
    api.deleteNotification(id).catch(console.error);
  };

  const resetDemo = async () => {
    await api.resetDemo();
    await loadData();
  };

  const addNotification = (n) => {
    api.addNotification(n).then((saved) => {
      dispatch({ type: "NOTIFICATION_ADDED", payload: saved });
    }).catch(console.error);
  };

  // Autonomous background agents — margin scan every 45 s, exception scan every 30 s
  useAgentRunner();
  // Client-side price simulation — dispatches ASSETS_BULK_UPDATED every 5 s
  useMarketFeed();

  const integration = useIntegration({ appendAudit, addNotification });

  const createDemoRepo = (({ counterparty, amount, currency, rate, proposedBasket }) => {
    const id = `R-${1000 + repos.length + 30}`;
    const assetIds = proposedBasket.picked.map((a) => a.id);
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const coverageRatio = ruleEngine?.counterparties?.[counterparty]?.minCoverageRatio
      ?? COUNTERPARTY_PROFILES[counterparty]?.coverageRatio
      ?? 1.03;

    // Block creation if max exposure would be exceeded
    const maxExposure = ruleEngine?.counterparties?.[counterparty]?.maxExposure;
    if (maxExposure !== undefined) {
      const activeExposure = repos
        .filter((r) => r.counterparty === counterparty && r.state === "Active")
        .reduce((sum, r) => sum + r.amount, 0);
      if (activeExposure + amount > maxExposure) {
        addNotification({
          severity: "Warning",
          text: `Cannot create repo: total exposure to ${counterparty} would exceed configured limit of ${maxExposure.toLocaleString()} RON.`,
          target: "EXPOSURE_LIMIT",
        });
        return;
      }
    }

    const newRepo = {
      id, counterparty, amount, currency, rate,
      startDate: today, maturityDate: tomorrow,
      state: "Active",
      requiredCollateral: Math.round(amount * coverageRatio),
      postedCollateral: Math.round(proposedBasket.adjusted),
      buffer: Math.round(proposedBasket.adjusted - amount * coverageRatio),
      settlement: "Awaiting confirmation",
      assets: assetIds,
      notes: "Created from the simulated treasury booking workflow.",
      integration: {
        sourceSystem: "CollateralOS Treasury Booking",
        sourceLedger: "Internal Treasury Book",
        settlementState: "pending_confirmation",
        reconState: "pending",
        custodyLocation: "SaFIR / BNR Central Registry",
        lastSyncTs: new Date().toISOString(),
        externalRef: `INT-TRY-${today.replace(/-/g, "")}-${id}`,
      },
    };
    dispatch({ type: "REPO_CREATED", payload: newRepo });
    for (const aid of assetIds) {
      const asset = assets.find((a) => a.id === aid);
      if (asset) dispatch({ type: "ASSET_UPDATED", payload: { ...asset, status: "Locked" } });
    }
    api.createRepo(newRepo).catch(console.error);
    for (const aid of assetIds) api.updateAsset(aid, { status: "Locked" }).catch(console.error);
    addNotification({ severity: "Info", text: `${id} created and awaiting settlement confirmation`, target: id });
    appendAudit({ ts: new Date().toISOString().slice(0, 16).replace("T", " "), user: user.name, role: user.role, action: "repo created", object: id, prev: "Draft", next: "Active", comment: `Trade created for ${counterparty} with auto-proposed collateral basket.` });
    openRepo(id);
  });

  const topUpRepo = (repoId, assetId) => {
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) return;
    const topUpValue = Math.round(adjustedValue(asset));
    const repo = repos.find((r) => r.id === repoId);
    if (!repo) return;
    const newPosted = repo.postedCollateral + topUpValue;
    const newBuffer = newPosted - repo.requiredCollateral;
    const updated = {
      ...repo,
      postedCollateral: newPosted,
      buffer: newBuffer,
      state: newBuffer >= 0 ? "Active" : repo.state,
      assets: [...repo.assets, assetId],
      notes: `${repo.notes} Top-up approved using ${asset.name}.`,
    };
    dispatch({ type: "REPO_UPDATED", payload: updated });
    dispatch({ type: "ASSET_UPDATED", payload: { ...asset, status: "Locked" } });
    dispatch({
      type: "NOTIFICATION_DISMISSED",
      payload: notifications.find((n) => n.target === repoId && n.text?.toLowerCase().includes("margin deficit"))?.id ?? "",
    });
    api.updateRepo(repoId, { postedCollateral: updated.postedCollateral, buffer: updated.buffer, state: updated.state, notes: updated.notes, assets: updated.assets }).catch(console.error);
    api.updateAsset(assetId, { status: "Locked" }).catch(console.error);
    appendAudit({ ts: new Date().toISOString().slice(0, 16).replace("T", " "), user: user.name, role: user.role, action: "top-up approved", object: repoId, prev: "Margin deficit", next: "Collateral increased", comment: `Additional collateral posted using ${assetId}.` });
    openRepo(repoId);
  };

  const closeRepo = (repoId) => {
    const repo = repos.find((r) => r.id === repoId);
    if (!repo) return;
    const updated = { ...repo, state: "Closed", settlement: "Confirmed", notes: `${repo.notes} Repo unwound and closed.` };
    dispatch({ type: "REPO_UPDATED", payload: updated });
    for (const aid of repo.assets) {
      const asset = assets.find((a) => a.id === aid);
      if (asset) dispatch({ type: "ASSET_UPDATED", payload: { ...asset, status: "Available" } });
    }
    api.updateRepo(repoId, { state: "Closed", settlement: "Confirmed", notes: updated.notes }).catch(console.error);
    for (const aid of repo.assets) api.updateAsset(aid, { status: "Available" }).catch(console.error);
    addNotification({ severity: "Info", text: `Collateral released for ${repoId}`, target: repoId });
    appendAudit({ ts: new Date().toISOString().slice(0, 16).replace("T", " "), user: user.name, role: user.role, action: "collateral released", object: repoId, prev: "Active", next: "Closed", comment: "Repo matured and linked collateral positions were released back to inventory." });
    openRepo(repoId);
  };

  const rolloverRepo = (repoId, newRate, newTermDays) => {
    const repo = repos.find((r) => r.id === repoId);
    if (!repo) return;
    const today = new Date().toISOString().slice(0, 10);
    const maturity = new Date(Date.now() + newTermDays * 86400000).toISOString().slice(0, 10);
    const newId = `R-${1000 + repos.length + 50}`;
    const coverageRatio = ruleEngine?.counterparties?.[repo.counterparty]?.minCoverageRatio
      ?? COUNTERPARTY_PROFILES[repo.counterparty]?.coverageRatio
      ?? 1.03;
    const newRepo = {
      id: newId,
      counterparty: repo.counterparty,
      amount: repo.amount,
      currency: repo.currency,
      rate: newRate,
      startDate: today,
      maturityDate: maturity,
      state: "Active",
      requiredCollateral: Math.round(repo.amount * coverageRatio),
      postedCollateral: repo.postedCollateral,
      buffer: Math.round(repo.postedCollateral - repo.amount * coverageRatio),
      settlement: "Awaiting confirmation",
      assets: repo.assets,
      notes: `Rolled over from ${repoId} at ${newRate}% for ${newTermDays}d.`,
      integration: {
        sourceSystem: "CollateralOS Treasury Booking",
        sourceLedger: "Internal Treasury Book",
        settlementState: "pending_confirmation",
        reconState: "pending",
        custodyLocation: repo.integration?.custodyLocation ?? "SaFIR / BNR Central Registry",
        lastSyncTs: new Date().toISOString(),
        externalRef: `INT-TRY-${today.replace(/-/g, "")}-${newId}`,
      },
    };
    const closed = { ...repo, state: "Closed", settlement: "Confirmed", notes: `${repo.notes} Rolled into ${newId}.` };
    dispatch({ type: "REPO_CREATED", payload: newRepo });
    dispatch({ type: "REPO_UPDATED", payload: closed });
    api.updateRepo(repoId, { state: "Closed", settlement: "Confirmed", notes: closed.notes }).catch(console.error);
    api.createRepo(newRepo).catch(console.error);
    addNotification({ severity: "Info", text: `${repoId} rolled into ${newId} at ${newRate}%`, target: newId });
    appendAudit({ ts: new Date().toISOString().slice(0, 16).replace("T", " "), user: user.name, role: user.role, action: "repo created", object: newId, prev: repoId, next: "Active", comment: `Rollover from ${repoId}: new rate ${newRate}%, ${newTermDays}d term.` });
    openRepo(newId);
  };

  const substituteCollateral = (repoId, oldAssetId, newAssetId) => {
    const oldAsset = assets.find((a) => a.id === oldAssetId);
    const newAsset = assets.find((a) => a.id === newAssetId);
    if (!oldAsset || !newAsset) return;
    const repo = repos.find((r) => r.id === repoId);
    if (!repo) return;
    const newAssets = repo.assets.filter((id) => id !== oldAssetId).concat(newAssetId);
    const allObjs = assets.map((a) => {
      if (a.id === newAssetId) return { ...a, status: "Locked" };
      if (a.id === oldAssetId) return { ...a, status: "Available" };
      return a;
    });
    const newPosted = Math.round(newAssets.reduce((sum, id) => {
      const a = allObjs.find((x) => x.id === id);
      return sum + (a ? adjustedValue(a) : 0);
    }, 0));
    const updated = { ...repo, assets: newAssets, postedCollateral: newPosted, buffer: newPosted - repo.requiredCollateral, notes: `${repo.notes} Substitution: ${oldAssetId} replaced by ${newAssetId}.` };
    dispatch({ type: "REPO_UPDATED", payload: updated });
    dispatch({ type: "ASSET_UPDATED", payload: { ...oldAsset, status: "Available" } });
    dispatch({ type: "ASSET_UPDATED", payload: { ...newAsset, status: "Locked" } });
    api.updateRepo(repoId, { assets: updated.assets, postedCollateral: updated.postedCollateral, buffer: updated.buffer, notes: updated.notes }).catch(console.error);
    api.updateAsset(oldAssetId, { status: "Available" }).catch(console.error);
    api.updateAsset(newAssetId, { status: "Locked" }).catch(console.error);
    appendAudit({ ts: new Date().toISOString().slice(0, 16).replace("T", " "), user: user.name, role: user.role, action: "collateral substituted", object: repoId, prev: oldAssetId, next: newAssetId, comment: `Substitution approved: ${oldAsset.name} replaced by ${newAsset.name}.` });
    openRepo(repoId);
  };

  const proposeSubstitution = (repoId, oldAssetId, newAssetId) => {
    const id = `SUB-${Date.now()}`;
    setPendingSubstitutions((prev) => [
      ...prev,
      { id, repoId, oldAssetId, newAssetId, proposedAt: new Date().toISOString().slice(0, 16).replace("T", " "), proposedBy: user.name },
    ]);
    addNotification({ severity: "Warning", text: `Collateral substitution proposed for ${repoId} — awaiting 4-eye approval`, target: repoId });
    appendAudit({ ts: new Date().toISOString().slice(0, 16).replace("T", " "), user: user.name, role: user.role, action: "substitution proposed", object: repoId, prev: oldAssetId, next: newAssetId, comment: `${user.name} proposed substitution: ${oldAssetId} → ${newAssetId}. Pending approval.` });
  };

  const approveSubstitution = (subId) => {
    const sub = pendingSubstitutions.find((s) => s.id === subId);
    if (!sub) return;
    substituteCollateral(sub.repoId, sub.oldAssetId, sub.newAssetId);
    setPendingSubstitutions((prev) => prev.filter((s) => s.id !== subId));
    appendAudit({ ts: new Date().toISOString().slice(0, 16).replace("T", " "), user: user.name, role: user.role, action: "substitution approved", object: sub.repoId, prev: sub.oldAssetId, next: sub.newAssetId, comment: `${user.name} approved substitution (4-eye): ${sub.oldAssetId} → ${sub.newAssetId}.` });
  };

  const rejectSubstitution = (subId) => {
    const sub = pendingSubstitutions.find((s) => s.id === subId);
    if (!sub) return;
    setPendingSubstitutions((prev) => prev.filter((s) => s.id !== subId));
    addNotification({ severity: "Info", text: `Substitution for ${sub.repoId} was rejected`, target: sub.repoId });
    appendAudit({ ts: new Date().toISOString().slice(0, 16).replace("T", " "), user: user.name, role: user.role, action: "substitution rejected", object: sub.repoId, prev: sub.oldAssetId, next: sub.newAssetId, comment: `${user.name} rejected proposed substitution: ${sub.oldAssetId} → ${sub.newAssetId}.` });
  };

  const eodLock = () => {
    const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
    const activeCount = repos.filter((r) => r.state !== "Closed").length;
    const totalCollateral = repos.filter((r) => r.state !== "Closed").reduce((s, r) => s + r.postedCollateral, 0);
    appendAudit({
      ts,
      user: user.name,
      role: user.role,
      action: "eod confirmed",
      object: "EoD-SNAPSHOT",
      prev: "Open",
      next: "EoD Confirmed",
      comment: `End-of-Day position lock: ${activeCount} active repos, total collateral ${totalCollateral.toLocaleString()} RON. All positions confirmed.`,
    });
    addNotification({ severity: "Info", text: `EoD position snapshot confirmed by ${user.name}`, target: "EoD-SNAPSHOT" });
  };

  const importAssets = async (file) => {
    const result = await api.importAssets(file);
    await loadData();
    return result;
  };

  const renderCurrentPage = () => {
    switch (current) {
      case "dashboard":
        return <Dashboard assets={assets} repos={repos} notifications={notifications} openRepo={openRepo} pendingSubstitutions={pendingSubstitutions} role={role} onApproveSubstitution={approveSubstitution} onRejectSubstitution={rejectSubstitution} onNavigate={setCurrent} onOpenAgreement={openAgreement} isLive={marketLive} />;
      case "inventory":
        return <Inventory assets={assets} selectedAsset={selectedAsset} setSelectedAsset={setSelectedAsset} importAssets={importAssets} />;
      case "repos":
        return <Repos repos={repos} assets={assets} openRepo={openRepo} createDemoRepo={createDemoRepo} role={role} permissions={permissions} />;
      case "margin":
        return <Margin repos={repos} assets={assets} topUpRepo={topUpRepo} openRepo={openRepo} role={role} permissions={permissions} />;
      case "operations":
        return <Operations repos={repos} assets={assets} openRepo={openRepo} permissions={permissions} />;
      case "audit":
        return <AuditTrail audit={audit} />;
      case "repo-detail":
        return <RepoDetail repo={selectedRepo} assets={assets} closeRepo={closeRepo} topUpRepo={topUpRepo} substituteCollateral={substituteCollateral} proposeSubstitution={proposeSubstitution} rolloverRepo={rolloverRepo} role={role} permissions={permissions} pendingSubstitutions={pendingSubstitutions} onApproveSubstitution={approveSubstitution} onRejectSubstitution={rejectSubstitution} />;
      case "counterparties":
        return <CounterpartyMonitor repos={repos} assets={assets} />;
      case "digital-positions":
        return <DigitalPositions assets={assets} audit={audit} />;
      case "sftr-report":
        return <SFTRReport repos={repos} assets={assets} />;
      case "notifications":
        return <Notifications notifications={notifications} onDismissNotification={dismissNotification} openRepo={(id) => { openRepo(id); setCurrent("repo-detail"); }} />;
      case "compliance":
        return <RegulatoryCompliance repos={repos} assets={assets} navigate={setCurrent} />;
      case "integration":
        return <IntegrationHub integration={integration} repos={repos} assets={assets} />;
      case "parameters-rules":
        return <ParametersRules />;
      case "portfolio-opt":
        return <PortfolioOptimisation repos={repos} assets={assets} openRepo={openRepo} />;
      case "business-case":
        return <BusinessCase />;
      case "agreements":
        return <Agreements role={role} permissions={permissions} onOpenAgreement={openAgreement} />;
      case "agreement-detail":
        return <AgreementDetail agreementId={selectedAgreementId} onBack={() => setCurrent("agreements")} onOpenMarginCall={openMarginCall} permissions={permissions} />;
      case "margin-call-detail":
        return <MarginCallDetail callId={selectedMarginCallId} onBack={() => selectedAgreementId ? setCurrent("agreement-detail") : setCurrent("agreements")} permissions={permissions} />;
      case "approvals":
        return <Approvals permissions={permissions} onOpenMarginCall={openMarginCall} />;
      case "audit-export":
        return <AuditExport permissions={permissions} />;
      case "admin":
        return <Admin onReset={resetDemo} />;
      default:
        return <Dashboard assets={assets} repos={repos} notifications={notifications} openRepo={openRepo} pendingSubstitutions={pendingSubstitutions} role={role} onApproveSubstitution={approveSubstitution} onRejectSubstitution={rejectSubstitution} onNavigate={setCurrent} onOpenAgreement={openAgreement} isLive={marketLive} />;
    }
  };

  const [showPrivacy, setShowPrivacy] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const handleLogin = (loggedInUser, requiresPwChange = false) => {
    dispatch({ type: "USER_LOGGED_IN", payload: loggedInUser });
    if (requiresPwChange) setMustChangePassword(true);
    const seen = localStorage.getItem(`co_tour_seen_${loggedInUser.email}`);
    if (!seen) setShowWelcome(true);
  };

  const startTour = () => {
    setShowWelcome(false);
    setTourActive(true);
    localStorage.setItem(`co_tour_seen_${user?.email}`, "1");
  };

  const endTour = () => setTourActive(false);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<PageFallback />}>
        {showPrivacy
          ? <PrivacyPolicy onClose={() => setShowPrivacy(false)} />
          : <Login onLogin={handleLogin} onPrivacy={() => setShowPrivacy(true)} />
        }
      </Suspense>
    );
  }

  if (loading && assets.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  if (mustChangePassword) {
    return <ChangePasswordModal onSuccess={() => setMustChangePassword(false)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {showWelcome && (
        <WelcomeModal
          user={user}
          onStartTour={startTour}
          onSkip={() => { setShowWelcome(false); localStorage.setItem(`co_tour_seen_${user?.email}`, "1"); }}
        />
      )}
      {tourActive && (
        <TourOverlay role={role} navigate={setCurrent} onEnd={endTour} />
      )}
      <div className="flex min-h-screen">
        <Sidebar current={current} setCurrent={setCurrent} notificationCount={notifications.filter(n => n.severity === "Critical").length} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar
            notifications={notifications}
            role={role}
            onLogout={handleLogout}
            onDismissNotification={dismissNotification}
            onReset={resetDemo}
            repos={repos}
            assets={assets}
            onEodLock={eodLock}
            onSwitchRole={handleSwitchRole}
            onStartTour={() => { setTourActive(true); }}
            onNavigate={(page, repoId) => {
              if (repoId) { setSelectedRepoId(repoId); }
              setCurrent(page);
            }}
          />
          {apiError && (
            <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-sm text-red-700 flex items-center gap-2">
              <span className="font-medium">Backend unreachable.</span> Check that the API server is running on port 3001.
              <button onClick={loadData} className="ml-auto text-red-600 underline hover:text-red-800">Retry</button>
            </div>
          )}
          <main className="p-6 md:p-8 flex-1 overflow-auto bg-[#f8f9fb]">
            <ScrollArea className="h-[calc(100vh-96px)] pr-4">
              <Suspense fallback={<PageFallback />}>
                <ErrorBoundary key={current}>
                  {renderCurrentPage()}
                </ErrorBoundary>
              </Suspense>
            </ScrollArea>
          </main>
        </div>
      </div>
    </div>
  );
}
