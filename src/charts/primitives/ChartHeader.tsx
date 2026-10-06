import type { ReactNode } from "react";
import type { FlagChip, HeaderModel, KpiModel } from "../model";
import type { LayoutPlan } from "../layout";

export function KpiLine({ kpi, compact }: { kpi: KpiModel; compact: boolean }) {
  return (
    <div className={"lc-chart__kpi" + (compact ? " lc-chart__kpi--compact" : "")}>
      <span className="lc-chart__kpi-value">{kpi.text}</span>
      {kpi.unit && <span className="lc-chart__kpi-unit">{kpi.unit}</span>}
      {kpi.maxText && <span className="lc-chart__kpi-max">{kpi.maxText}</span>}
      {kpi.rangeText && <span className="lc-chart__kpi-max">{kpi.rangeText}</span>}
      {kpi.comparison && (
        <span className="lc-chart__kpi-delta" data-dir={kpi.comparison.direction} title={kpi.comparison.basis}>
          {kpi.comparison.direction === "up" ? "▲" : kpi.comparison.direction === "down" ? "▼" : "■"} {kpi.comparison.text}
          <span className="lc-sr"> {kpi.comparison.basis}</span>
        </span>
      )}
    </div>
  );
}

function Flags({ flags, collapsed }: { flags: FlagChip[]; collapsed: boolean }) {
  if (!flags.length) return null;
  if (collapsed)
    return (
      <span className="lc-flags">
        <span className="lc-flag" title={flags.map((f) => f.label).join(", ")} tabIndex={0} aria-label={`${flags.length} flags: ${flags.map((f) => f.label).join(", ")}`}>
          {flags.length} flags
        </span>
      </span>
    );
  return (
    <span className="lc-flags">
      {flags.map((f, i) => (
        <span key={i} className="lc-flag" data-kind={f.kind} title={f.tooltip || undefined}>
          {f.kind === "positive" ? "▲" : f.kind === "negative" ? "▼" : "●"} {f.label}
        </span>
      ))}
    </span>
  );
}

export function ChartHeader({ header, plan, actions }: { header: HeaderModel; plan: LayoutPlan; actions?: ReactNode }) {
  const badge = header.badge;
  return (
    <div className="lc-chart__header">
      <div className="lc-chart__titlebar">
        <h3 className="lc-chart__title" title={header.title} style={{ WebkitLineClamp: plan.title.lines }}>
          {header.title}
        </h3>
        {plan.flags.visible && <Flags flags={header.flags} collapsed={plan.flags.collapsed} />}
        {badge && (
          <span className="lc-badge" data-tone={badge.tone} title={`${badge.text} (${badge.source})`} style={badge.color ? { color: badge.color, borderColor: badge.color } : undefined}>
            <span>{badge.text}</span>
          </span>
        )}
        {actions && <span className="lc-chart__actions">{actions}</span>}
      </div>
      {plan.description.visible && header.description && (
        <p className="lc-chart__desc" style={{ WebkitLineClamp: plan.description.lines }}>
          {header.description}
        </p>
      )}
      {plan.kpi.visible && header.kpi && <KpiLine kpi={header.kpi} compact={plan.kpi.compact} />}
    </div>
  );
}
