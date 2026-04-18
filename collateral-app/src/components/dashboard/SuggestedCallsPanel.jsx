import { useEffect, useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtMoney } from "@/domain/format";
import { api } from "@/integrations/api";

export function SuggestedCallsPanel({ onOpenAgreement }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.suggestedCalls();
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load suggested calls");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card className="rounded-md shadow-sm border-blue-200">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600" />
          <CardTitle className="text-blue-900 text-base">Suggested margin calls</CardTitle>
        </div>
        <CardDescription>
          Repos where posted collateral falls below the required level. Amounts rounded up to each agreement's rounding step.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-slate-500 py-3">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-600 py-2">{error}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-500 py-2">All repos fully collateralised.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repo</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead className="text-right">Deficit</TableHead>
                <TableHead className="text-right">Suggested call</TableHead>
                <TableHead className="text-right">Agreement</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 5).map((r) => (
                <TableRow key={r.repoId}>
                  <TableCell className="font-mono text-xs">{r.repoId}</TableCell>
                  <TableCell className="text-sm">{r.counterparty}</TableCell>
                  <TableCell className="text-right text-sm text-red-700">{fmtMoney(r.deficit, r.currency)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold text-slate-900">{fmtMoney(r.suggestedCallAmount, r.currency)}</TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => onOpenAgreement?.(r.agreementId)}
                      className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline font-mono"
                    >
                      {r.agreementId} <ArrowRight className="h-3 w-3" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
