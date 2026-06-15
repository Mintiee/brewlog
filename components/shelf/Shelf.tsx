"use client";
import { useState } from "react";
import { activeGrams, coffeeStatus, frozenGramsOf, remainingGrams, avgDailyGrams, formatWeight, formatDaysWorth, bagAvgRating } from "@/lib/domain";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { OriginTile } from "@/components/ui/OriginTile";
import { CoffeeName } from "@/components/ui/CoffeeName";
import { FreshDot } from "@/components/ui/FreshDot";
import { ShelfRow } from "./ShelfRow";
import { FrozenRow } from "./FrozenRow";
import { CoffeeDetail } from "./CoffeeDetail";
import { AddCoffee } from "./AddCoffee";
import type { Coffee, Brew } from "@/lib/types";

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

  const live = coffees.filter((c) => !c.archived);
  const archived = coffees.filter((c) => c.archived);
  const totalGrams = live.reduce((s, c) => s + remainingGrams(c, brews), 0);
  const perDay = avgDailyGrams(brews);
  const worth = perDay > 0 ? formatDaysWorth(totalGrams / perDay) : null;
  const activeList = live
    .filter((c) => activeGrams(c, brews) > 0)
    .map((c) => ({ c, st: coffeeStatus(c, brews) }));
  const frozenList = live.filter((c) => frozenGramsOf(c, brews) > 0);
  const emptyList = live.filter((c) => activeGrams(c, brews) <= 0 && frozenGramsOf(c, brews) <= 0);

  const sortRested = (arr: typeof activeList) =>
    [...arr].sort((a, b) => {
      const da = coffeeStatus(a.c, brews).day;
      const db = coffeeStatus(b.c, brews).day;
      return db - da;
    });

  const groups = [
    { key: "peak", title: "In peak", items: sortRested(activeList.filter((d) => d.st.state === "peak")) },
    { key: "resting", title: "Resting", items: sortRested(activeList.filter((d) => d.st.state === "resting")) },
    { key: "past", title: "Past peak", items: sortRested(activeList.filter((d) => d.st.state === "past")) },
  ].filter((g) => g.items.length);

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

      <div className="screen-pad" style={{ marginTop: 22 }}>
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
            {g.items.map(({ c }) => (
              <ShelfRow key={c.id} coffee={c} brews={brews} onOpen={setDetail} />
            ))}
          </div>
        ))}

        {frozenList.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="label" style={{ marginBottom: 11, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="snow" size={13} stroke={1.8} style={{ color: "var(--frozen)" }} /> In the freezer · {frozenList.length}
            </div>
            {frozenList.map((c) => (
              <FrozenRow key={c.id} coffee={c} brews={brews} onOpen={setDetail} />
            ))}
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
                <OriginTile code={c.cc} roaster={c.roaster} color={c.color} size={34} radius={9} process={c.process} />
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
                {archived.map((c) => {
                  const avg = bagAvgRating(c.id, brews);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setDetail(c)}
                      style={{
                        width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                        background: "transparent", border: "1px dashed var(--line-2)", borderRadius: 13, padding: "10px 14px", marginBottom: 8, opacity: 0.6,
                      }}
                    >
                      <OriginTile code={c.cc} roaster={c.roaster} color={c.color} size={30} radius={8} process={c.process} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <CoffeeName coffee={c} style={{ fontSize: 14 }} />
                        <div className="label" style={{ color: "var(--ink-faint)" }}>{c.roaster}{c.grams ? ` · ${formatWeight(c.grams)}` : ""}</div>
                      </div>
                      {avg != null ? (
                        <span className="mono" style={{ fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                          <Icon name="star" size={12} stroke={1.8} /> {avg.toFixed(1)}
                        </span>
                      ) : (
                        <span className="label" style={{ fontSize: 9 }}>finished</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="screen-bottom" />
      </div>

      <AddCoffee open={adding} onClose={() => setAdding(false)} onAdd={onAdd} llmEnabled={llmEnabled} coffees={coffees} />
      <CoffeeDetail
        coffee={liveDetail}
        brews={brews}
        coffees={coffees}
        onClose={() => setDetail(null)}
        onBrew={(c) => { setDetail(null); onBrew(c); }}
        onUpdate={onUpdate}
      />
    </div>
  );
}
