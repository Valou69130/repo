import { useState } from "react";
import { AlertTriangle, RefreshCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/integrations/api";
import { useDomain } from "@/domain/store";
import { getPermissions } from "@/domain/permissions";

export function Admin({ onReset }) {
  const { user } = useDomain();
  const perms = getPermissions(user?.role);
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [lastReset, setLastReset] = useState(null);
  const [error, setError] = useState(null);

  if (!perms.canReset) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Admin</h1>
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
          <Shield className="h-4 w-4 flex-shrink-0" />
          Admin functions are restricted to Treasury Manager.
        </div>
      </div>
    );
  }

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      await api.resetDemo();
      setLastReset(new Date().toLocaleTimeString());
      setConfirming(false);
      onReset?.();
    } catch (err) {
      setError(err.message ?? "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Admin</h1>
        <p className="mt-1 text-slate-500">Demo environment controls. Treasury Manager only.</p>
      </div>

      <Card className="rounded-md shadow-sm border-amber-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-700">
            <RefreshCw className="h-4 w-4" /> Demo Reset
          </CardTitle>
          <CardDescription>
            Wipes all transactional data (repos, margin calls, agreements, audit events) and reseeds
            the database with the standard demo dataset. User accounts are preserved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastReset && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
              <RefreshCw className="h-3.5 w-3.5" /> Demo reset completed at {lastReset}. Reload the page to see fresh data.
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </div>
          )}

          {!confirming ? (
            <Button
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => setConfirming(true)}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Reset Demo Data
            </Button>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
              <div className="flex items-start gap-2 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold">Confirm demo reset</div>
                  <div className="mt-0.5 text-red-700">
                    All repos, margin calls, agreements, and audit events will be permanently deleted and replaced with demo data.
                    This cannot be undone.
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleReset}
                  disabled={resetting}
                >
                  {resetting ? "Resetting…" : "Yes, reset everything"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={resetting}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-md border-dashed bg-slate-50">
        <CardContent className="p-5 text-xs text-slate-500 space-y-1.5">
          <div className="font-semibold text-slate-700 mb-1">Demo Environment</div>
          <div>• Reset preserves all user accounts — no need to re-login after reset</div>
          <div>• Rule engine parameters are also reset to defaults on demo reset</div>
          <div>• SFTR submission history is cleared on reset</div>
          <div>• Logged-in user: <span className="font-medium text-slate-700">{user?.name} ({user?.role})</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
