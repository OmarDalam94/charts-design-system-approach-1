import { useMemo, useState } from "react";
import type { DataTableModel, TableCell } from "../model";

const PAGE = 50;

function compare(a: TableCell | undefined, b: TableCell | undefined): number {
  const x = a?.sort ?? null;
  const y = b?.sort ?? null;
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  if (typeof x === "number" && typeof y === "number") return x - y;
  return String(x).localeCompare(String(y), "en-US", { numeric: true });
}

/** Accessible table with sorting by underlying values (missing values last) and pagination. */
export function DataTableView({
  table,
  pageSize = PAGE,
  sortable = true,
  caption,
}: {
  table: DataTableModel;
  pageSize?: number;
  sortable?: boolean;
  caption?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    if (!sort) return table.rows;
    return [...table.rows].sort((a, b) => {
      const c = compare(a[sort.key], b[sort.key]);
      const nulls = (a[sort.key]?.sort ?? null) === null || (b[sort.key]?.sort ?? null) === null;
      return nulls ? c : c * sort.dir;
    });
  }, [table.rows, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = rows.slice(current * pageSize, current * pageSize + pageSize);
  return (
    <div className="lc-dataview">
      <div className="lc-dataview__scroll" tabIndex={0} role="region" aria-label={caption ?? table.caption}>
        <table className="lc-table">
          <caption>
            {caption ?? table.caption} · {rows.length} row{rows.length === 1 ? "" : "s"}
          </caption>
          <thead>
            <tr>
              {table.columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" className={c.numeric ? "is-num" : undefined} aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
                    {sortable ? (
                      <button
                        type="button"
                        className="lc-table__sort"
                        onClick={() => {
                          setPage(0);
                          setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }));
                        }}
                      >
                        {c.label}
                        <span aria-hidden="true">{active ? (sort!.dir === 1 ? "▲" : "▼") : "↕"}</span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={current * pageSize + i}>
                {table.columns.map((c, ci) => {
                  const cell = r[c.key];
                  const Tag = ci === 0 ? "th" : "td";
                  return (
                    <Tag key={c.key} scope={ci === 0 ? "row" : undefined} className={c.numeric ? "is-num" : undefined} title={cell?.text && cell.text.length > 24 ? cell.text : undefined}>
                      {cell?.text ?? ""}
                      {cell?.note && <span className="lc-table__note">{cell.note}</span>}
                    </Tag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="lc-pager">
          <span>
            Rows {current * pageSize + 1}–{Math.min(rows.length, (current + 1) * pageSize)} of {rows.length}
          </span>
          <span>
            <button type="button" className="lc-linkbtn" disabled={current === 0} onClick={() => setPage(current - 1)}>
              Previous
            </button>
            <button type="button" className="lc-linkbtn" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              Next
            </button>
          </span>
        </div>
      )}
      {table.notes.length > 0 && (
        <ul className="lc-dataview__notes">
          {table.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
