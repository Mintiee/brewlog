"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { avgDailyGrams, formatWeight, formatDaysWorth, bagAvgRatings } from "@/lib/domain";
import { coffeeHaystack, filterCoffees, isFilterActive, originFacets, roasterFacets } from "@/lib/domain/search";
import { useCoffeeStats } from "@/lib/hooks/useCoffeeStats";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { OriginTile } from "@/components/ui/OriginTile";
import { FreshDot } from "@/components/ui/FreshDot";
import { useCoffeeColor } from "@/lib/store/AppContext";
import { ShelfRow } from "./ShelfRow";
import { FrozenRow } from "./FrozenRow";
import { ResultRow } from "./ResultRow";
import { RoasterPickerSheet } from "./RoasterPickerSheet";
import dynamic from "next/dynamic";
import { EMPTY_STAT } from "@/lib/domain/derive";
import type { Coffee, Brew, FreshStatus } from "@/lib/types";

// Secondary sheets: several hundred lines each, and neither renders anything until the
// user opens it. Splitting keeps them out of the initial download; they load when the
// Shelf tab first mounts, well before anyone can tap into them.
const CoffeeDetail = dynamic(() => import("./CoffeeDetail").then((m) => m.CoffeeDetail), { ssr: false });
const AddCoffee = dynamic(() => import("./AddCoffee").then((m) => m.AddCoffee), { ssr: false });

const chipRow: React.CSSProperties = { display: "flex", gap: 7, overflowX: "auto", scrollbarWidth: "none", marginTop: 8, paddingBottom: 2 };
const chipStyle: React.CSSProperties = { fontSize: 13, padding: "7px 12px", flexShrink: 0 };

interface ShelfProps {
  coffees: Coffee[];
  brews: Brew[];
  onAdd: (c: Coffee) => void;
  onBrew: (c: Coffee) => void;
  onUpdate: (c: Coffee) => void;
  llmEnabled: boolean;
}

export function Shelf({ coffees, brews, onAdd, onBrew, onUpdate, llmEnabled }: ShelfProps) {
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Coffee | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState<string | null>(null);
  const [roaster, setRoaster] = useState<string | null>(null);
  const [pickingRoaster, setPickingRoaster] = useState(false);
  const colorOf = useCoffeeColor();

  // One pass over brews for the whole shelf, instead of ~15 per coffee. See
  // lib/domain/derive.ts — the per-coffee primitives each rescan every brew and nest,
  // so calling them per row (and, previously, twice per sort comparison) made a tab
  // switch scale with coffees x brews.
  const stats = useCoffeeStats(coffees, brews);

  const { live, archived, totalGrams, groups, frozenList, emptyList } = useMemo(() => {
    const live = coffees.filter((c) => !c.archived);
    const archived = coffees.filter((c) => c.archived);

    const activeList: { c: Coffee; st: FreshStatus }[] = [];
    const frozenList: Coffee[] = [];
    const emptyList: Coffee[] = [];
    let totalGrams = 0;

    for (const c of live) {
      const s = stats.get(c.id) ?? EMPTY_STAT;
      totalGrams += s.remaining;
      if (s.active > 0) activeList.push({ c, st: s.status });
      if (s.frozen > 0) frozenList.push(c);
      if (s.active <= 0 && s.frozen <= 0) emptyList.push(c);
    }

    // `day` is read from the already-computed status rather than recomputed inside the
    // comparator, which is what made this O(C log C) x O(B).
    const sortRested = (arr: typeof activeList) =>
      [...arr].sort((a, b) => b.st.day - a.st.day);

    const groups = [
      { key: "peak", title: "In peak", items: sortRested(activeList.filter((d) => d.st.state === "peak")) },
      { key: "past", title: "Past peak", items: sortRested(activeList.filter((d) => d.st.state === "past")) },
      { key: "resting", title: "Resting", items: sortRested(activeList.filter((d) => d.st.state === "resting")) },
    ].filter((g) => g.items.length);

    return { live, archived, totalGrams, groups, frozenList, emptyList };
  }, [coffees, stats]);

  const avgs = useMemo(() => bagAvgRatings(brews), [brews]);

  // Haystacks and facets rebuild only when the shelf changes, never per keystroke.
  const haystacks = useMemo(() => new Map(coffees.map((c) => [c.id, coffeeHaystack(c)])), [coffees]);
  const origins = useMemo(() => originFacets(coffees), [coffees]);
  const roasters = useMemo(() => roasterFacets(coffees), [coffees]);

  const deferredQuery = useDeferredValue(query);
  const filtering = isFilterActive({ query, origin, roaster });
  const results = useMemo(() => {
    if (!isFilterActive({ query: deferredQuery, origin, roaster })) return [];
    // Live bags first, then finished; newest roast first within each.
    return filterCoffees(coffees, { query: deferredQuery, origin, roaster }, haystacks).sort(
      (a, b) => Number(a.archived) - Number(b.archived) || (b.roasted_at || "").localeCompare(a.roasted_at || ""),
    );
  }, [coffees, haystacks, deferredQuery, origin, roaster]);
  const clearFilters = () => { setQuery(""); setOrigin(null); setRoaster(null); };

  // Top roasters as chips; the rest live behind "More…". A selection from the
  // sheet that isn't in the top set still shows as an active chip.
  const TOP_ROASTERS = 4;
  const roasterChips = roasters.slice(0, TOP_ROASTERS);
  const pickedExtra = roaster && !roasterChips.some((r) => r.key === roaster) ? roasters.find((r) => r.key === roaster) : undefined;

  const perDay = useMemo(() => avgDailyGrams(brews), [brews]);
  const worth = perDay > 0 ? formatDaysWorth(totalGrams / perDay) : null;

  // keep detail in sync with latest coffee data after an update
  const liveDetail = detail ? coffees.find((c) => c.id === detail.id) || detail : null;

  return (
    <div className="screen">
      <div className="screen-pad" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", paddingTop: 8 }}>
        <div>
          <div className="label">{live.length} coffee{live.length === 1 ? "" : "s"} · {formatWeight(totalGrams)}{worth ? ` · ${worth}` : ""}</div>
          <h1 className="h-ask" style={{ fontSize: 30, marginTop: 3 }}>Shelf</h1>
        </div>
        <button onClick={() => setAdding(true)} className="btn btn-accent" style={{ width: 50, height: 50, borderRadius: 16, flexShrink: 0 }}>
          <Icon name="plus" size={24} stroke={2} />
        </button>
      </div>

      {coffees.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="screen-pad">
            <div style={{ position: "relative" }}>
              <Icon name="search" size={17} stroke={1.8} style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--ink-faint)", pointerEvents: "none" }} />
              <input
                inputMode="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search bags, farms, notes…"
                aria-label="Search the shelf"
                enterKeyHint="search"
                style={{
                  width: "100%", padding: "11px 40px 11px 38px", borderRadius: 13, background: "var(--surface)", border: "1px solid var(--line)",
                  color: "var(--ink)", fontFamily: "var(--font-ui)", fontSize: 16, outline: "none", boxSizing: "border-box",
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", width: 32, height: 32, display: "grid", placeItems: "center", background: "none", border: "none", color: "var(--ink-faint)", cursor: "pointer" }}
                >
                  <Icon name="close" size={15} stroke={2} />
                </button>
              )}
            </div>
          </div>
          {/* Origins and roasters on separate rows, so a long origin list never buries the roasters. */}
          {origins.length > 1 && (
            <div className="screen-pad" style={chipRow}>
              {origins.map((o) => (
                <button key={o.key} className="chip" data-on={origin === o.key} onClick={() => setOrigin(origin === o.key ? null : o.key)} style={chipStyle}>
                  {o.name}
                </button>
              ))}
            </div>
          )}
          {roasters.length > 1 && (
            <div className="screen-pad" style={chipRow}>
              {pickedExtra && (
                <button className="chip" data-on onClick={() => setRoaster(null)} style={chipStyle}>
                  {pickedExtra.name} <span style={{ opacity: 0.6 }}>{pickedExtra.count}</span>
                </button>
              )}
              {roasterChips.map((r) => (
                <button key={r.key} className="chip" data-on={roaster === r.key} onClick={() => setRoaster(roaster === r.key ? null : r.key)} style={chipStyle}>
                  {r.name} <span style={{ opacity: 0.6 }}>{r.count}</span>
                </button>
              ))}
              {roasters.length > TOP_ROASTERS && (
                <button className="chip" onClick={() => setPickingRoaster(true)} style={chipStyle}>
                  More…
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="screen-pad" style={{ marginTop: 22 }}>
        {filtering && (
          <div>
            <div className="label" style={{ marginBottom: 11, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{results.length} bag{results.length === 1 ? "" : "s"}</span>
              <button onClick={clearFilters} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", font: "inherit", padding: 0 }}>
                Clear
              </button>
            </div>
            {results.map((c) => (
              <ResultRow key={c.id} coffee={c} status={stats.get(c.id)?.status} avg={avgs.get(c.id) ?? null} onOpen={setDetail} />
            ))}
            {results.length === 0 && (
              <EmptyState icon="search" title="No bags match" body="Try a farm, roaster, origin or tasting note." iconSize={36} titleSize={15} pad="36px 20px">
                <button className="chip" style={{ marginTop: 14 }} onClick={clearFilters}>Clear filters</button>
              </EmptyState>
            )}
          </div>
        )}

        {!filtering && (<>
        {live.length === 0 && (
          <EmptyState
            icon="shelf"
            title="Your shelf is empty"
            body="Scan a bag or paste a link to add your first coffee. To import from Bean Conqueror or a CSV, go to Settings → Import."
            iconSize={48}
            titleSize={17}
            pad="60px 20px"
          >
            <button
              className="btn btn-accent"
              style={{ marginTop: 20, width: "auto", padding: "0 22px", display: "inline-flex" }}
              onClick={() => setAdding(true)}
            >
              <Icon name="plus" size={19} stroke={2} /> Add a coffee
            </button>
          </EmptyState>
        )}

        {groups.map((g) => (
          <div key={g.key} style={{ marginBottom: 14 }}>
            <div className="label" style={{ marginBottom: 11, display: "flex", alignItems: "center", gap: 8 }}>
              <FreshDot state={g.key} /> {g.title} · {g.items.length}
            </div>
            {g.items.map(({ c, st }) => (
              <ShelfRow key={c.id} coffee={c} active={(stats.get(c.id) ?? EMPTY_STAT).active} status={st} onOpen={setDetail} />
            ))}
          </div>
        ))}

        {frozenList.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="label" style={{ marginBottom: 11, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="snow" size={13} stroke={1.8} style={{ color: "var(--frozen)" }} /> In the freezer · {frozenList.length}
            </div>
            {frozenList.map((c) => {
              const s = stats.get(c.id) ?? EMPTY_STAT;
              return <FrozenRow key={c.id} coffee={c} frozen={s.frozen} status={s.status} onOpen={setDetail} />;
            })}
          </div>
        )}

        {emptyList.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="label" style={{ marginBottom: 11, display: "flex", alignItems: "center", gap: 8 }}>
              <span className="dot" style={{ background: "var(--ink-faint)" }} /> Out of beans · {emptyList.length}
            </div>
            {emptyList.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetail(c)}
                onKeyDown={(e) => e.key === "Enter" && setDetail(c)}
                style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: "11px 14px", marginBottom: 8, cursor: "pointer" }}
              >
                <OriginTile code={c.cc} roaster={c.roaster} color={colorOf(c.notes)} size={34} radius={9} process={c.process} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  <div className="label" style={{ color: "var(--ink-faint)" }}>looks empty</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onUpdate({ ...c, archived: true }); }}
                  className="chip"
                  style={{ flexShrink: 0 }}
                >
                  Finished
                </button>
              </div>
            ))}
          </div>
        )}

        {archived.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <button
              onClick={() => setShowArchive((v) => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                background: "none", border: "none", cursor: "pointer", color: "var(--ink-faint)", padding: "8px 2px",
              }}
            >
              <Icon name="chev" size={14} stroke={2} style={{ transform: showArchive ? "rotate(90deg)" : "none", transition: "transform .2s ease" }} />
              <span className="label">Finished · {archived.length}</span>
            </button>
            {showArchive && (
              <div style={{ marginTop: 6 }}>
                {archived.map((c) => (
                  <ResultRow key={c.id} coffee={c} avg={avgs.get(c.id) ?? null} onOpen={setDetail} />
                ))}
              </div>
            )}
          </div>
        )}

        </>)}

        <div className="screen-bottom" />
      </div>

      <RoasterPickerSheet open={pickingRoaster} roasters={roasters} selected={roaster} onPick={setRoaster} onClose={() => setPickingRoaster(false)} />
      <AddCoffee open={adding} onClose={() => setAdding(false)} onAdd={onAdd} llmEnabled={llmEnabled} coffees={coffees} />
      <CoffeeDetail
        coffee={liveDetail}
        brews={brews}
        coffees={coffees}
        onClose={() => setDetail(null)}
        onBrew={(c) => { setDetail(null); onBrew(c); }}
        onUpdate={onUpdate}
        onOpen={setDetail}
        onSearch={(text) => { setDetail(null); setOrigin(null); setRoaster(null); setQuery(text); }}
      />
    </div>
  );
}
