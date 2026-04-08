import { useState } from "react";
import { Filter, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Info } from "@/components/shared/Info";
import { fmtMoney, adjustedValue } from "@/domain/format";
import { eligibilitySummary } from "@/domain/eligibility";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/integrations/api";

export function Inventory({ assets, selectedAsset, setSelectedAsset, importAssets }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [importing, setImporting] = useState(false);

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await importAssets(file);
      alert(`Imported ${result.imported} position(s) successfully.${result.errors.length ? ` ${result.errors.length} error(s).` : ""}`);
    } catch (err) {
      alert("Import failed: " + err.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const filtered = assets.filter((a) => {
    const textMatch = [a.name, a.isin, a.issuer, a.type]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
    const statusMatch = status === "all" ? true : a.status === status;
    return textMatch && statusMatch;
  });

  const exportCSV = () => {
    const headers = ["Asset ID","ISIN","Name","Type","Currency","Market Value","Haircut %","Adjusted Value","Eligibility","Custody","Status"];
    const rows = filtered.map(a => [a.id, a.isin, a.name, a.type, a.currency, a.marketValue, a.haircut, adjustedValue(a).toFixed(0), a.eligibility, a.custody, a.status]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "collateral_inventory.csv"; link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Collateral Inventory</h1>
        <p className="mt-1 text-slate-500">Track available, reserved, locked, and pledged assets with eligibility and custody context.</p>
      </div>

      <Card className="rounded-md shadow-sm">
        <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3 w-full md:max-w-lg">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-3 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by ISIN, asset, issuer..."
                className="pl-9 rounded-md"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[180px] rounded-md">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Available">Available</SelectItem>
                <SelectItem value="Reserved">Reserved</SelectItem>
                <SelectItem value="Locked">Locked</SelectItem>
                <SelectItem value="Pledged">Pledged</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <input type="file" accept=".csv" id="csv-import" className="hidden" onChange={handleImport} />
            <Button variant="outline" className="rounded-md" onClick={() => api.downloadCsvTemplate()}>
              Template
            </Button>
            <Button variant="outline" className="rounded-md" disabled={importing} onClick={() => document.getElementById("csv-import").click()}>
              {importing ? "Importing..." : "Import CSV"}
            </Button>
            <Button className="rounded-md" onClick={exportCSV}>Export CSV</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-md shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset ID</TableHead>
                <TableHead>ISIN</TableHead>
                <TableHead>Asset Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Market Value</TableHead>
                <TableHead>Haircut</TableHead>
                <TableHead>Adjusted Value</TableHead>
                <TableHead>Eligibility</TableHead>
                <TableHead>Custody</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => setSelectedAsset(a)}>
                  <TableCell>{a.id}</TableCell>
                  <TableCell>{a.isin}</TableCell>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>{a.type}</TableCell>
                  <TableCell>{fmtMoney(a.marketValue, a.currency)}</TableCell>
                  <TableCell>{a.haircut}%</TableCell>
                  <TableCell>{fmtMoney(adjustedValue(a), a.currency)}</TableCell>
                  <TableCell>{a.eligibility}</TableCell>
                  <TableCell>{a.custody}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={!!selectedAsset} onOpenChange={(open) => !open && setSelectedAsset(null)}>
        <SheetContent className="w-[540px] sm:w-[540px]">
          {selectedAsset && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedAsset.name}</SheetTitle>
                <SheetDescription>{selectedAsset.isin}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-5 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <Info label="Issuer" value={selectedAsset.issuer} />
                  <Info label="Asset Type" value={selectedAsset.type} />
                  <Info label="Quantity" value={selectedAsset.quantity.toLocaleString()} />
                  <Info label="Custody Location" value={selectedAsset.custody} />
                  <Info label="Market Value" value={fmtMoney(selectedAsset.marketValue, selectedAsset.currency)} />
                  <Info label="Adjusted Value" value={fmtMoney(adjustedValue(selectedAsset), selectedAsset.currency)} />
                </div>
                <Separator />
                <div>
                  <div className="font-medium mb-2">Current Encumbrance State</div>
                  <StatusBadge status={selectedAsset.status} />
                </div>
                <Separator />
                <div>
                  <div className="font-medium mb-3">Eligibility Rule Evaluation</div>
                  {(() => {
                    const { results, passed, failed, eligible } = eligibilitySummary(selectedAsset);
                    return (
                      <>
                        <div className={`flex items-center gap-2 text-xs font-semibold mb-3 px-3 py-2 rounded ${eligible ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                          {eligible
                            ? <><CheckCircle2 className="h-3.5 w-3.5" /> All {passed} rules passed — eligible for standard repo</>
                            : <><XCircle className="h-3.5 w-3.5" /> {failed} rule{failed > 1 ? "s" : ""} failed — restricted or ineligible</>}
                        </div>
                        <div className="space-y-0 rounded border overflow-hidden">
                          {results.map((r) => (
                            <div key={r.id} className="flex items-start gap-3 px-3 py-2.5 border-b last:border-0 bg-white">
                              {r.pass
                                ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                                : <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />}
                              <div className="min-w-0">
                                <div className={`text-xs font-medium ${r.pass ? "text-slate-800" : "text-red-700"}`}>{r.label}</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">{r.description}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
