import { useState } from "react";
import { CaretDown, Check, MagnifyingGlass, X } from "@phosphor-icons/react";
import {
  VISUAL_CATEGORIES,
  visualTypeById,
  visualTypesForCategory,
} from "./visualCatalog";
import type { VisualCategoryId, VisualType } from "./visualCatalog";
import VisualArtwork from "./VisualArtwork";

type Props = {
  selectedId: string | null;
  databaseId?: string | null;
  onSelect: (visual: VisualType) => void;
};

type PickerGroupId = VisualCategoryId | "recommended" | "kpi";

const DEMO_RECOMMENDED_VISUAL_IDS = ["vertical-bar", "area-chart"];
const KPI_VISUAL_IDS = new Set(["kpi-card", "kpi-grid", "legacy-kpi"]);

function VisualCard({
  visual,
  selected,
  onSelect,
}: {
  visual: VisualType;
  selected: boolean;
  onSelect: (visual: VisualType) => void;
}) {
  return (
    <button
      type="button"
      className={"viz-type-card" + (selected ? " is-selected" : "")}
      aria-pressed={selected}
      onClick={() => onSelect(visual)}
    >
      <span className="viz-type-card__artwrap">
        <VisualArtwork
          visualId={visual.id}
          category={visual.category}
          size="stack"
        />
      </span>
      <span className="viz-type-card__body">
        <span className="viz-type-card__heading">
          <span className="viz-type-card__title">{visual.label}</span>
          {selected && (
            <Check className="viz-type-card__check" size={16} weight="bold" aria-hidden="true" />
          )}
        </span>
        <span className="viz-type-card__desc">{visual.description}</span>
      </span>
    </button>
  );
}

export default function VisualTypePicker({ selectedId, databaseId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<PickerGroupId>>(
    () => new Set<PickerGroupId>(["recommended", "kpi", "chart", "map-layer"]),
  );
  const query = search.trim().toLowerCase();
  const recommendedItems = (databaseId
    ? DEMO_RECOMMENDED_VISUAL_IDS
    : []
  )
    .map(visualTypeById)
    .filter((visual): visual is VisualType => Boolean(visual));
  const filteredRecommendedItems = recommendedItems.filter(
    (visual) =>
      !query ||
      visual.label.toLowerCase().includes(query) ||
      visual.description.toLowerCase().includes(query),
  );
  const categoryGroups = VISUAL_CATEGORIES.map((category) => ({
    id: category.id as PickerGroupId,
    label: category.label,
    items: visualTypesForCategory(category.id)
      .filter(
        (visual) =>
          category.id !== "chart" || !KPI_VISUAL_IDS.has(visual.id),
      )
      .filter(
        (visual) =>
          !query ||
          visual.label.toLowerCase().includes(query) ||
          visual.description.toLowerCase().includes(query),
      ),
  }));
  const kpiItems = Array.from(KPI_VISUAL_IDS)
    .map(visualTypeById)
    .filter((visual): visual is VisualType => Boolean(visual))
    .filter(
      (visual) =>
        !query ||
        visual.label.toLowerCase().includes(query) ||
        visual.description.toLowerCase().includes(query),
    );
  const groups = [
    { id: "kpi" as PickerGroupId, label: "KPIs", items: kpiItems },
    ...categoryGroups,
  ];
  const resultCount = groups.reduce(
    (total, group) => total + group.items.length,
    filteredRecommendedItems.length,
  );
  const showRecommended =
    recommendedItems.length > 0 &&
    (!query || filteredRecommendedItems.length > 0);
  const recommendedOpen = query ? true : openGroups.has("recommended");

  const toggleGroup = (id: PickerGroupId) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="viz-type-picker">
      <header className="viz-type-picker__head">
        <h2 className="viz-type-picker__title">Select Visualization Type</h2>
        <label className="viz-type-picker__search">
          <MagnifyingGlass size={17} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search visualization types…"
            aria-label="Search visualization types"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear visualization search"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setSearch("")}
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </label>
      </header>

      {showRecommended && (
        <section
          className={
            "viz-type-group viz-type-group--recommended" +
            (recommendedOpen ? " is-open" : "")
          }
        >
          <button
            type="button"
            className="viz-type-group__head"
            aria-expanded={recommendedOpen}
            aria-controls="viz-group-recommended"
            onClick={() => toggleGroup("recommended")}
          >
            <span className="viz-type-group__label">Recommended</span>
            <span className="viz-type-group__rule" aria-hidden="true" />
            <CaretDown
              className="viz-type-group__caret"
              size={16}
              weight="bold"
              aria-hidden="true"
            />
          </button>
          <div
            id="viz-group-recommended"
            className={
              "viz-type-group__panel" + (recommendedOpen ? " is-open" : "")
            }
            hidden={!recommendedOpen}
          >
            <div className="viz-type-grid">
              {filteredRecommendedItems.map((visual) => (
                <VisualCard
                  key={visual.id}
                  visual={visual}
                  selected={selectedId === visual.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {groups.map(({ id, label, items }) => {
        if (query && items.length === 0) return null;
        const open = query ? true : openGroups.has(id);
        return (
          <section
            key={id}
            className={"viz-type-group" + (open ? " is-open" : "")}
          >
            <button
              type="button"
              className="viz-type-group__head"
              aria-expanded={open}
              aria-controls={`viz-group-${id}`}
              onClick={() => toggleGroup(id)}
            >
              <span className="viz-type-group__label">{label}</span>
              <span className="viz-type-group__rule" aria-hidden="true" />
              <CaretDown className="viz-type-group__caret" size={16} weight="bold" aria-hidden="true" />
            </button>
            <div
              id={`viz-group-${id}`}
              className={"viz-type-group__panel" + (open ? " is-open" : "")}
              hidden={!open}
            >
              <div className="viz-type-grid">
                {items.map((visual) => (
                  <VisualCard
                    key={visual.id}
                    visual={visual}
                    selected={selectedId === visual.id}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          </section>
        );
      })}
      {query && resultCount === 0 && (
        <p className="viz-type-picker__empty">
          No visualization types match “{search.trim()}”.
        </p>
      )}
    </div>
  );
}
