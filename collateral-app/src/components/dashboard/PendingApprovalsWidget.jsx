import { GitCompareArrows, ThumbsDown, ThumbsUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PendingApprovalsWidget({
  pendingSubstitutions,
  assets,
  repos,
  role,
  onApproveSubstitution,
  onRejectSubstitution,
}) {
  const canApprove = role === "Treasury Manager";
  if (pendingSubstitutions.length === 0) return null;

  return (
    <Card className="rounded-md shadow-sm border-amber-200">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400 flex-shrink-0" />
          <CardTitle className="text-amber-800">Pending 4-Eye Approvals</CardTitle>
          <span className="ml-auto text-[10px] uppercase tracking-widest font-semibold text-amber-600 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded">
            {pendingSubstitutions.length} pending
          </span>
        </div>
        <CardDescription>
          {canApprove
            ? "Collateral substitutions proposed by Collateral Managers awaiting your approval."
            : "Your proposed substitutions are staged here awaiting Treasury Manager sign-off."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {pendingSubstitutions.map((sub) => {
            const oldA = assets.find((a) => a.id === sub.oldAssetId);
            const newA = assets.find((a) => a.id === sub.newAssetId);
            const repo = repos.find((r) => r.id === sub.repoId);
            return (
              <div
                key={sub.id}
                className="rounded border border-amber-200 bg-amber-50 p-4 flex items-center gap-4 flex-wrap"
              >
                <GitCompareArrows className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900">
                    <span className="font-mono text-xs text-slate-500 mr-2">{sub.repoId}</span>
                    {oldA?.name ?? sub.oldAssetId}
                    <span className="text-slate-400 mx-2">→</span>
                    {newA?.name ?? sub.newAssetId}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Proposed by {sub.proposedBy} · {sub.proposedAt}
                    {repo && <> · {repo.counterparty}</>}
                  </div>
                </div>
                {canApprove && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded transition"
                      onClick={() => onApproveSubstitution(sub.id)}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded transition"
                      onClick={() => onRejectSubstitution(sub.id)}
                    >
                      <ThumbsDown className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                )}
                {!canApprove && (
                  <span className="text-xs text-amber-600 italic flex-shrink-0">Awaiting approval</span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
