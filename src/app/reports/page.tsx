import { PhasePlaceholder } from "@/components/phase-placeholder";

export default function ReportsPage() {
  return (
    <PhasePlaceholder title="Reports" phase="Phase 2">
      <p>
        Daily through yearly reports with PDF, Excel and CSV export are scheduled
        for Phase 2.
      </p>
      <p>
        The aggregation functions the reports will draw on already exist and are
        tested: <code>summarizeCashFlow</code>, <code>dailyCashFlow</code> and{" "}
        <code>netWorthHistory</code>.
      </p>
    </PhasePlaceholder>
  );
}
