// ─── Workflows — Public API ───────────────────────────────────────────────────
export type { WorkflowResult, WorkflowContext }               from "./types";
export { failedWorkflow }                                      from "./types";
export { runAllocation, approveAllocation }                    from "./AllocationWorkflow";
export type { RunAllocationInput, ApproveAllocationInput }     from "./AllocationWorkflow";
export { runMarginScan, advanceAlert, approveTopUp }           from "./MarginWorkflow";
export type { RunMarginScanInput, AdvanceAlertInput }          from "./MarginWorkflow";
export { analyzeSubstitution, executeSubstitution, recordSubstitutionProposal } from "./SubstitutionWorkflow";
export type { SubstitutionAnalysis, SubstitutionExecution, AssetSnapshot, CoverageSummary, AnalyzeSubstitutionInput, ExecuteSubstitutionInput } from "./SubstitutionWorkflow";
