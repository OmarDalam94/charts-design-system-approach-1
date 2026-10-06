import { lazy, Suspense, useEffect, useState } from "react";
import CreateComponentPopup from "./CreateComponentPopup";
import EditComponentModal from "./EditComponentModal";
import { COMPONENT_LIST_ROWS } from "./componentCatalog";
import {
  SearchIcon,
  PlusIcon,
  BellIcon,
  InfoIcon,
  Glyph,
} from "./icons";
import { isBuilderHash, LAB_ROUTE } from "./lab/route";

const ChartLab = lazy(() => import("./lab/ChartLab"));

const NAV: { label: string; d: string; href?: string }[] = [
  { label: "Organization", d: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-4h6v4" },
  { label: "Assets", d: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { label: "Filters", d: "M4 5h16l-6 8v6l-4-2v-4z" },
  { label: "Events", d: "M3 5h18v16H3zM3 9h18M8 3v4M16 3v4" },
  { label: "AI Models", d: "M12 3l2.5 5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1z" },
  { label: "Data Sources", d: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" },
  { label: "Workspaces", d: "M3 7h18v12H3zM3 7l3-3h6l3 3" },
  { label: "Users", d: "M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  { label: "Security", d: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" },
  { label: "Reporting", d: "M5 21V9m7 12V3m7 18v-7" },
  { label: "Scheduled Queries", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" },
  { label: "Backup & Restore", d: "M21 12a9 9 0 1 1-3-6.7M21 4v4h-4" },
  { label: "Theme", d: "M12 3a9 9 0 1 0 9 9c0-.5-2-.2-3-1-1.2-1-.5-3-2-4-1.2-.8-2 .5-3.5 0C11 6 12.5 4 12 3z" },
  { label: "Chart System Lab", d: "M4 20V10m6 10V4m6 16v-7m4 7H2", href: LAB_ROUTE },
];

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

const ROWS = COMPONENT_LIST_ROWS;

function Sparkline() {
  return (
    <svg width="40" height="22" viewBox="0 0 40 22" className="spark">
      <polyline
        points="1,18 7,12 13,15 19,7 25,11 31,4 39,9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function App() {
  const [createPopupOpen, setCreatePopupOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [draftComponent, setDraftComponent] = useState<{ name: string } | null>(null);
  const hash = useHash();

  const openEditModal = (draft?: { name: string } | null) => {
    setDraftComponent(draft ?? null);
    setEditModalOpen(true);
  };

  if (!isBuilderHash(hash)) {
    return (
      <Suspense fallback={<div className="app" role="status">Loading Chart System Lab…</div>}>
        <ChartLab />
      </Suspense>
    );
  }

  return (
    <div className="app">
      <div id="mesh-gradient-bg" aria-hidden="true" />

      {/* Top bar */}
      <header className="topbar">
        <div className="brand">
          <span className="brand__logo">◆</span>
          <span className="brand__name">Lumen</span>
        </div>
        <div className="topbar__search">
          <SearchIcon width={20} height={20} />
          <input placeholder="Search" />
        </div>
        <div className="topbar__actions">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => setCreatePopupOpen(true)}
          >
            <PlusIcon width={15} height={15} />
            <span>Create</span>
          </button>
          <button className="icon-btn icon-btn--round">
            <BellIcon width={17} height={17} />
            <span className="badge-dot" />
          </button>
          <div className="avatar" />
        </div>
      </header>

      <div className="layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <p className="sidebar__caption">Platform Settings</p>
          <nav>
            {NAV.map((n) => (
              n.href ? (
                <a key={n.label} className="nav-item" href={n.href}>
                  <Glyph d={n.d} width={16} height={16} />
                  <span>{n.label}</span>
                </a>
              ) : (
                <button
                  key={n.label}
                  className={
                    "nav-item" + (n.label === "Assets" ? " is-active" : "")
                  }
                >
                  <Glyph d={n.d} width={16} height={16} />
                  <span>{n.label}</span>
                </button>
              )
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="main">
          <div className="table">
            <div className="table__body">
              {ROWS.map((r) => (
                <button
                  key={r.id}
                  className="row"
                  onClick={() => openEditModal()}
                >
                  <span className="row__icon">
                    <Sparkline />
                  </span>
                  <span className="row__name">{r.name}</span>
                  <span className="row__cat">{r.category}</span>
                  <span className="row__type">{r.type}</span>
                  <span className="row__status">
                    <span className="status-badge">● Active</span>
                  </span>
                  <span className="row__date">{r.date}</span>
                  <span className="row__more">
                    <span>
                      <InfoIcon width={15} height={15} />
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <div className="table__footer">
              <div className="pager-left">
                <span>Items per page</span>
                <span className="pill">25</span>
              </div>
              <span className="pager-mid">1–25 of 198</span>
              <div className="pager-right">
                <button className="pg is-active">1</button>
                <button className="pg">2</button>
                <button className="pg">3</button>
                <button className="pg">›</button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {createPopupOpen && (
        <CreateComponentPopup
          onClose={() => setCreatePopupOpen(false)}
          onEditComponent={(name) => {
            setCreatePopupOpen(false);
            openEditModal({ name });
          }}
        />
      )}

      {editModalOpen && (
        <EditComponentModal
          componentName={draftComponent?.name}
          startAtVisualPicker={draftComponent !== null}
          creating={draftComponent !== null}
          onClose={() => {
            setEditModalOpen(false);
            setDraftComponent(null);
          }}
        />
      )}
    </div>
  );
}
