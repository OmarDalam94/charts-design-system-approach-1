import type { LegendModel } from "../model";
import type { LegendPlan } from "../layout";
import { Swatch } from "./Tooltip";

/**
 * Interactive legend. Visibility toggles are view state only and never
 * change persisted settings. Every item stays reachable: overflow is
 * expanded or scrolled, never sliced.
 */
export function Legend({
  model,
  plan,
  hidden,
  onToggle,
  onOnly,
  onShowAll,
  expanded,
  onExpand,
  interactive = true,
}: {
  model: LegendModel;
  plan: LegendPlan;
  hidden: Set<string>;
  onToggle: (id: string) => void;
  onOnly: (id: string) => void;
  onShowAll: () => void;
  expanded: boolean;
  onExpand: (v: boolean) => void;
  interactive?: boolean;
}) {
  const side = plan.position === "left" || plan.position === "right";
  const rowH = 22;
  const listMax = side ? undefined : expanded ? Math.max(rowH, plan.size - (plan.overflow ? rowH : 0)) : plan.visibleRows * rowH;
  const hiddenCount = model.items.filter((i) => hidden.has(i.id)).length;
  const hiddenWithinClip = !expanded && plan.overflow;
  return (
    <div
      className={"lc-legend" + (side ? " lc-legend--side" : "") + (expanded ? " lc-legend--expanded" : "")}
      style={side ? { width: plan.size, maxHeight: "100%", display: "flex", flexDirection: "column" } : undefined}
      role="group"
      aria-label={`Legend, ${model.items.length} item${model.items.length === 1 ? "" : "s"}${hiddenCount ? `, ${hiddenCount} hidden` : ""}`}
    >
      <ul className="lc-legend__list" style={listMax !== undefined ? { maxHeight: listMax } : undefined}>
        {model.items.map((item) => {
          const shown = !hidden.has(item.id);
          const stat = [plan.showValues && item.valueText, plan.showPercentages && (item.percentText ?? "—")].filter(Boolean).join(" · ");
          const fullLabel = `${item.label}${stat ? `, ${stat}` : ""}${plan.showPercentages && item.percentReason ? ` (${item.percentReason})` : ""}`;
          return (
            <li className="lc-legend__item" key={item.id}>
              {interactive ? (
                <button
                  type="button"
                  className="lc-legend__toggle"
                  aria-pressed={shown}
                  title={fullLabel}
                  onClick={() => onToggle(item.id)}
                  aria-label={`${fullLabel}. ${shown ? "Shown" : "Hidden"}`}
                >
                  <Swatch color={item.color} dash={item.dash} marker={item.marker} />
                  {model.showLabels && (
                    <span className="lc-legend__label" style={{ maxWidth: plan.labelMax }}>
                      {item.label}
                    </span>
                  )}
                  {stat && <span className="lc-legend__stat">{stat}</span>}
                </button>
              ) : (
                <span className="lc-legend__toggle" title={fullLabel}>
                  <Swatch color={item.color} dash={item.dash} marker={item.marker} />
                  <span className="lc-legend__label" style={{ maxWidth: plan.labelMax }}>
                    {item.label}
                  </span>
                  {stat && <span className="lc-legend__stat">{stat}</span>}
                </span>
              )}
              {interactive && model.items.length > 1 && (
                <button type="button" className="lc-legend__only" onClick={() => onOnly(item.id)} aria-label={`Show only ${item.label}`}>
                  Only
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {(plan.overflow || hiddenCount > 0) && (
        <div className="lc-legend__more">
          {plan.overflow && (
            <button type="button" className="lc-linkbtn" aria-expanded={expanded} onClick={() => onExpand(!expanded)}>
              {expanded ? "Show fewer" : `Show all ${model.items.length}`}
            </button>
          )}
          {hiddenCount > 0 && interactive && (
            <button type="button" className="lc-linkbtn" onClick={onShowAll}>
              Show all series ({hiddenCount} hidden)
            </button>
          )}
          {hiddenWithinClip && <span className="lc-sr">Some legend items are clipped; use Show all to list them.</span>}
        </div>
      )}
    </div>
  );
}
