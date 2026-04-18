// ─── Parameters & Rules ───────────────────────────────────────────────────────
// Three role-gated sections: Haircut & Eligibility, Coverage & Exposure,
// Risk Parameters. Each section is read-only unless the user's role owns it.

import { useState } from "react";
import { Lock, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDomain, useDispatch, useRuleEngine } from "@/domain/store";
import { getPermissions } from "@/domain/permissions";
import { api } from "@/integrations/api";
import { fmtMoney } from "@/domain/format";

const ASSET_CLASSES = ["Government Bond", "T-Bill", "MMF", "Corporate Bond", "Covered Bond"];
const ELIGIBILITY_TYPES = ["overnight-repo", "central-bank", "counterparty-restricted"];

function SectionHeader({ title, locked }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {locked && (
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Lock className="h-3 w-3" /> Read-only for your role
        </span>
      )}
    </div>
  );
}

// ── Section A: Haircut & Eligibility ─────────────────────────────────────────

function HaircutSection({ ruleEngine, canEdit, onSave }) {
  const [haircuts, setHaircuts] = useState({ ...ruleEngine.haircuts });
  const [eligibility, setEligibility] = useState(
    Object.fromEntries(ASSET_CLASSES.map((c) => [c, [...(ruleEngine.eligibility[c] ?? [])]]))
  );
  const [saving, setSaving] = useState(false);

  function toggleElig(cls, type) {
    setEligibility((prev) => {
      const cur = prev[cls] ?? [];
      return {
        ...prev,
        [cls]: cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type],
      };
    });
  }

  async function handleSave() {
    setSaving(true);
    await onSave({ haircuts, eligibility });
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 p-5 mb-6">
      <SectionHeader title="Haircut & Eligibility" locked={!canEdit} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="pb-2 font-medium">Asset Class</th>
              <th className="pb-2 font-medium">Haircut %</th>
              {ELIGIBILITY_TYPES.map((t) => (
                <th key={t} className="pb-2 font-medium capitalize">{t.replace(/-/g, " ")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ASSET_CLASSES.map((cls) => (
              <tr key={cls} className="border-b last:border-0">
                <td className="py-2.5 font-medium text-slate-800">{cls}</td>
                <td className="py-2.5">
                  {canEdit ? (
                    <input
                      type="number" min={0} max={50} step={0.5}
                      value={haircuts[cls] ?? 0}
                      onChange={(e) => setHaircuts((h) => ({ ...h, [cls]: parseFloat(e.target.value) || 0 }))}
                      className="w-20 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                    />
                  ) : (
                    <span className="tabular-nums">{ruleEngine.haircuts[cls] ?? 0}%</span>
                  )}
                </td>
                {ELIGIBILITY_TYPES.map((type) => (
                  <td key={type} className="py-2.5 text-center">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={(eligibility[cls] ?? []).includes(type)}
                      onChange={() => canEdit && toggleElig(cls, type)}
                      className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving…" : "Save Haircuts"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Section B: Coverage & Exposure ───────────────────────────────────────────

function CoverageSection({ ruleEngine, canEdit, onSave }) {
  const [rows, setRows] = useState(
    Object.entries(ruleEngine.counterparties).map(([cp, v]) => ({ cp, ...v }))
  );
  const [threshold, setThreshold] = useState(ruleEngine.approvalThreshold);
  const [saving, setSaving] = useState(false);

  function updateRow(cp, field, value) {
    setRows((prev) => prev.map((r) => r.cp === cp ? { ...r, [field]: Number(value) } : r));
  }

  async function handleSave() {
    setSaving(true);
    const counterparties = Object.fromEntries(
      rows.map(({ cp, minCoverageRatio, maxExposure, mta }) => [cp, { minCoverageRatio, maxExposure, mta }])
    );
    await onSave({ counterparties, approvalThreshold: threshold });
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 p-5 mb-6">
      <SectionHeader title="Coverage & Exposure" locked={!canEdit} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="pb-2 font-medium">Counterparty</th>
              <th className="pb-2 font-medium">Min Coverage %</th>
              <th className="pb-2 font-medium">Max Exposure</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cp, minCoverageRatio, maxExposure }) => (
              <tr key={cp} className="border-b last:border-0">
                <td className="py-2.5 font-medium text-slate-800">{cp}</td>
                <td className="py-2.5">
                  {canEdit ? (
                    <input
                      type="number" min={1.00} max={1.20} step={0.01}
                      value={minCoverageRatio}
                      onChange={(e) => updateRow(cp, "minCoverageRatio", parseFloat(e.target.value) || 1.0)}
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                    />
                  ) : (
                    <span className="tabular-nums">{(minCoverageRatio * 100).toFixed(0)}%</span>
                  )}
                </td>
                <td className="py-2.5">
                  {canEdit ? (
                    <input
                      type="number" min={0} step={500000}
                      value={maxExposure}
                      onChange={(e) => updateRow(cp, "maxExposure", Number(e.target.value))}
                      className="w-36 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                    />
                  ) : (
                    <span className="tabular-nums">{fmtMoney(maxExposure, "RON")}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-3 border-t pt-4">
        <span className="text-sm text-slate-600 font-medium">4-Eyes Approval Threshold</span>
        {canEdit ? (
          <input
            type="number" min={0} step={1000000}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-36 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
          />
        ) : (
          <span className="tabular-nums text-sm">{threshold.toLocaleString()} RON</span>
        )}
        <span className="text-xs text-slate-400">Substitutions above this notional require 4-eyes approval</span>
      </div>
      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving…" : "Save Coverage Rules"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Section C: Risk Parameters ────────────────────────────────────────────────

function RiskSection({ ruleEngine, canEdit, onSave }) {
  const [rows, setRows] = useState(
    Object.entries(ruleEngine.counterparties).map(([cp, v]) => ({ cp, mta: v.mta }))
  );
  const [stressPct, setStressPct] = useState(ruleEngine.stressPct);
  const [saving, setSaving] = useState(false);

  function updateMta(cp, value) {
    setRows((prev) => prev.map((r) => r.cp === cp ? { ...r, mta: Number(value) } : r));
  }

  async function handleSave() {
    setSaving(true);
    const counterparties = Object.fromEntries(
      rows.map(({ cp, mta }) => [cp, { ...ruleEngine.counterparties[cp], mta }])
    );
    await onSave({ counterparties, stressPct });
    setSaving(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 p-5 mb-6">
      <SectionHeader title="Risk Parameters" locked={!canEdit} />
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-slate-600 font-medium">Default Stress Test %</span>
        {canEdit ? (
          <input
            type="number" min={0} max={30} step={1}
            value={stressPct}
            onChange={(e) => setStressPct(Number(e.target.value))}
            className="w-20 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
          />
        ) : (
          <span className="tabular-nums text-sm">{stressPct}%</span>
        )}
        <span className="text-xs text-slate-400">Initial value for the Margin stress test slider</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-slate-500 uppercase tracking-wide">
              <th className="pb-2 font-medium">Counterparty</th>
              <th className="pb-2 font-medium">Min Transfer Amount (MTA)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cp, mta }) => (
              <tr key={cp} className="border-b last:border-0">
                <td className="py-2.5 font-medium text-slate-800">{cp}</td>
                <td className="py-2.5">
                  {canEdit ? (
                    <input
                      type="number" min={0} step={10000}
                      value={mta}
                      onChange={(e) => updateMta(cp, e.target.value)}
                      className="w-32 rounded border border-slate-300 px-2 py-1 text-sm tabular-nums"
                    />
                  ) : (
                    <span className="tabular-nums">{mta.toLocaleString()}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving…" : "Save Risk Parameters"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ParametersRules() {
  const dispatch = useDispatch();
  const { user } = useDomain();
  const ruleEngine = useRuleEngine();
  const perms = getPermissions(user?.role);

  async function handleSave(partial) {
    const merged = partial.counterparties
      ? {
          ...partial,
          counterparties: {
            ...ruleEngine.counterparties,
            ...Object.fromEntries(
              Object.entries(partial.counterparties).map(([cp, v]) => [
                cp,
                { ...ruleEngine.counterparties[cp], ...v },
              ])
            ),
          },
        }
      : partial;
    dispatch({ type: "RULE_ENGINE_UPDATED", payload: merged });
    await api.updateRuleEngine(merged);
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-6 flex items-center gap-3">
        <Settings2 className="h-5 w-5 text-slate-400" />
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Parameters & Rules</h1>
          <p className="text-sm text-slate-500">
            Configurable rule engine — each section is editable only by the role that owns it.
          </p>
        </div>
      </div>

      <HaircutSection ruleEngine={ruleEngine} canEdit={perms.canEditHaircuts} onSave={handleSave} />
      <CoverageSection ruleEngine={ruleEngine} canEdit={perms.canEditCoverage} onSave={handleSave} />
      <RiskSection ruleEngine={ruleEngine} canEdit={perms.canEditRiskParams} onSave={handleSave} />
    </div>
  );
}
