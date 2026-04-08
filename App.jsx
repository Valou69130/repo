import { useState, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { Inventory } from "@/pages/Inventory";
import { Repos } from "@/pages/Repos";
import { Margin } from "@/pages/Margin";
import { Operations } from "@/pages/Operations";
import { AuditTrail } from "@/pages/AuditTrail";
import { RepoDetail } from "@/pages/RepoDetail";
import { DigitalPositions } from "@/pages/DigitalPositions";
import { SFTRReport } from "@/pages/SFTRReport";
import { CounterpartyMonitor } from "@/pages/CounterpartyMonitor";
import { Notifications } from "@/pages/Notifications";
import { RegulatoryCompliance } from "@/pages/RegulatoryCompliance";
import { adjustedValue } from "@/domain/format";
import { getPermissions } from "@/domain/permissions";
import { api } from "@/integrations/api";
import { IntegrationHub } from "@/pages/IntegrationHub";
import { PortfolioOptimisation } from "@/pages/PortfolioOptimisation";
import { useIntegration } from "@/integrations/useIntegration";
import { DomainProvider, useDomain, useDispatch } from "@/domain/store";

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

  const { user, assets, repos, audit, notifications, loading } = state;

  const [current, setCurrent]                   = useState("dashboard");
  const [selectedAsset, setSelectedAsset]       = useState(null);
  const [selectedRepoId, setSelectedRepoId]     = useState(null);
  const [apiError, setApiError]                 = useState(false);
  const [pendingSubstitutions, setPendingSubstitutions] = useState([]);

  const role = user?.role || "Treasury Manager";
  const permissions = getPermissions(role);

  const loadData = useCallback(async () => {
    dispatch({ type: "LOAD_STARTED" });
    try {
      const [a, r, n, au] = await Promise.all([
        api.getAssets(),
        api.getRepos(),
        api.getNotifications(),
        api.getAudit(),
      ]);
      dispatch({
        type: "LOAD_SUCCESS",
        payload: { assets: a, repos: r, notifications: n, audit: au },
      });
      setApiError(false);
    } catch (err) {
      console.error("Failed to load data:", err);
      dispatch({ type: "LOAD_FAILED", payload: err?.message ?? "Failed to load" });
      setApiError(true);
    }
  }, [dispatch]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  const handleLogin = (loggedInUser) => {
    dispatch({ type: "USER_LOGGED_IN", payload: loggedInUser });
  };

  const handleLogout = () => {
    localStorage.removeItem("co_token");
    localStorage.removeItem("co_user");
    dispatch({ type: "USER_LOGGED_OUT" });
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

  // Integration layer — bootstrapped once with stable callback refs
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const integration = useIntegration({ appendAudit, addNotification });

  const createDemoRepo = (({ counterparty, amount, currency, rate, proposedBasket }) => {
    const id = `R-${1000 + repos.length + 30}`;
    const assetIds = proposedBasket.picked.map((a) => a.id);
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const newRepo = {
      id, counterparty, amount, currency, rate,
      startDate: today, maturityDate: tomorrow,
      state: "Active",
      requiredCollateral: Math.round(amount * 1.03),
      postedCollateral: Math.round(proposedBasket.adjusted),
      buffer: Math.round(proposedBasket.adjusted - amount * 1.03),
      settlement: "Awaiting confirmation",
      assets: assetIds,
      notes: "Created from the simulated treasury booking workflow.",
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
    const newRepo = {
      id: newId,
      counterparty: repo.counterparty,
      amount: repo.amount,
      currency: repo.currency,
      rate: newRate,
      startDate: today,
      maturityDate: maturity,
      state: "Active",
      requiredCollateral: Math.round(repo.amount * 1.03),
      postedCollateral: repo.postedCollateral,
      buffer: Math.round(repo.postedCollateral - repo.amount * 1.03),
      settlement: "Awaiting confirmation",
      assets: repo.assets,
      notes: `Rolled over from ${repoId} at ${newRate}% for ${newTermDays}d.`,
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
      action: "repo created",
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

  if (!user) return <Login onLogin={handleLogin} />;

  if (loading && assets.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
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
          <main className="p-6 md:p-8 flex-1 overflow-auto">
            <ScrollArea className="h-[calc(100vh-96px)] pr-4">
              {current === "dashboard" && <Dashboard assets={assets} repos={repos} notifications={notifications} openRepo={openRepo} pendingSubstitutions={pendingSubstitutions} role={role} onApproveSubstitution={approveSubstitution} onRejectSubstitution={rejectSubstitution} onNavigate={setCurrent} />}
              {current === "inventory" && <Inventory assets={assets} selectedAsset={selectedAsset} setSelectedAsset={setSelectedAsset} importAssets={importAssets} />}
              {current === "repos" && <Repos repos={repos} assets={assets} openRepo={openRepo} createDemoRepo={createDemoRepo} role={role} permissions={permissions} />}
              {current === "margin" && <Margin repos={repos} assets={assets} topUpRepo={topUpRepo} openRepo={openRepo} role={role} permissions={permissions} />}
              {current === "operations" && <Operations repos={repos} assets={assets} openRepo={openRepo} permissions={permissions} />}
              {current === "audit" && <AuditTrail audit={audit} />}
              {current === "repo-detail" && <RepoDetail repo={selectedRepo} assets={assets} closeRepo={closeRepo} topUpRepo={topUpRepo} substituteCollateral={substituteCollateral} proposeSubstitution={proposeSubstitution} rolloverRepo={rolloverRepo} role={role} permissions={permissions} pendingSubstitutions={pendingSubstitutions} onApproveSubstitution={approveSubstitution} onRejectSubstitution={rejectSubstitution} />}
              {current === "counterparties" && <CounterpartyMonitor repos={repos} assets={assets} />}
              {current === "digital-positions" && <DigitalPositions assets={assets} audit={audit} />}
              {current === "sftr-report" && <SFTRReport repos={repos} assets={assets} />}
              {current === "notifications" && <Notifications notifications={notifications} onDismissNotification={dismissNotification} openRepo={(id) => { openRepo(id); setCurrent("repo-detail"); }} />}
              {current === "compliance" && <RegulatoryCompliance repos={repos} assets={assets} />}
              {current === "integration" && <IntegrationHub integration={integration} repos={repos} assets={assets} />}
              {current === "portfolio-opt" && <PortfolioOptimisation repos={repos} assets={assets} openRepo={openRepo} />}
            </ScrollArea>
          </main>
        </div>
      </div>
    </div>
  );
}
