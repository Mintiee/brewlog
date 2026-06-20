"use client";
import { useState, useRef, useEffect } from "react";
import type { Brew, Brewer, Recipe } from "@/lib/types";
import { useApp } from "@/lib/store/AppContext";
import { restDaysAt, activeGrams } from "@/lib/domain";
import { Icon } from "@/components/ui";
import { StepWhat } from "./StepWhat";
import { StepHow, type Audience } from "./StepHow";
import { StepRate } from "./StepRate";
import { BrewDetail } from "@/components/palate/BrewDetail";

import type { Coffee } from "@/lib/types";

type Step = "what" | "how" | "logged" | "rate" | "done";

interface BrewFlowProps {
  resetKey?: number;
  startCoffee?: { coffee: Coffee; nonce: number } | null;
  onStep?: (step: string) => void;
  onGotoShelf?: () => void;
}

export function BrewFlow({ resetKey, startCoffee, onStep, onGotoShelf }: BrewFlowProps = {}) {
  const { coffees, brews, config, profile, members, authed, startBrew, rateBrew, updateBrew, updateCoffee, dismissBrew, dismissBrewSession } = useApp();
  // The other household member (if any) — the target for "send to rate". Matched
  // by name, not id, so duplicate same-name profiles don't make me my own target.
  const otherMember = members.find((m) => m.name !== profile.name) ?? null;

  const [step, setStep] = useState<Step>("what");
  const [coffee, setCoffee] = useState(coffees[0] ?? null);
  const [brewer, setBrewer] = useState<Brewer | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [rateTarget, setRateTarget] = useState<Brew | null>(null);
  const [detailBrew, setDetailBrew] = useState<Brew | null>(null);
  // Audience chosen for the last log — drives the confirmation screen copy and action visibility.
  const [loggedAudience, setLoggedAudience] = useState<Audience>("me");
  // Persistence state of the just-logged brew(s): the confirmation screen shows
  // optimistically, but the auto-dismiss timer only starts once the insert is
  // confirmed — a failed save must not melt away as if it had worked.
  const [saveState, setSaveState] = useState<"saving" | "saved" | "failed">("saved");
  // The brew rows of the last log attempt, kept for the in-place Retry.
  const lastLogged = useRef<Brew[]>([]);
  // Set when the just-logged dose looks like the bag's last serving — the
  // logged screen shows an info line ("Marked {name} finished") and the bag
  // is auto-archived in persistLogged. Ref mirrors state so persistLogged
  // (called in the same tick the state is set) reads the fresh value.
  const [finishCandidate, setFinishCandidate] = useState<Coffee | null>(null);
  const finishRef = useRef<Coffee | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const logTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (logTimer.current) clearTimeout(logTimer.current); }, []);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; onStep?.(step); }, [step, onStep]);
  // Reset to "what" when resetKey changes (tab switch)
  useEffect(() => { if (resetKey !== undefined) { setStep("what"); setCoffee(coffees[0] ?? null); } }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Jump to "how" when brewThis is called from another screen
  useEffect(() => {
    if (startCoffee?.coffee) { setCoffee(startCoffee.coffee); setStep("how"); }
  }, [startCoffee?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  function coffeeById(id: string) {
    return coffees.find((c) => c.id === id) ?? null;
  }
  function brewerById(id: string) {
    return config.brewers.find((b) => b.id === id) ?? null;
  }

  function logCoffee(b: Brewer, r: Recipe, audience: Audience) {
    setBrewer(b);
    setRecipe(r);
    const startedAt = Date.now();
    const isGuest = audience === "guest";
    // Assign a shared session_id when splitting with the other household member.
    const sessionId = audience === "split" && otherMember ? crypto.randomUUID() : null;
    // "partner" mode: whole cup for the other member — hand off the single row for them to rate.
    const rateFor = audience === "partner" && otherMember ? otherMember.id : null;
    const newBrew: Brew = {
      id: crypto.randomUUID(),
      household_id: profile.household_id,
      coffee_id: coffee!.id,
      brewer_id: b.id,
      dose: r.dose,
      water: r.water,
      temp: r.temp,
      grind: r.grind,
      water_type: r.water_type,
      bypass: r.bypass || 0,
      ratio: (r.water + (r.bypass || 0)) / r.dose,
      pending: true,
      rate_for: rateFor,
      session_id: sessionId,
      guest: isGuest,
      started_at: String(startedAt),
      // Snapshot the freeze-adjusted rest now, so it stays correct if the
      // coffee is later re-frozen or its dates edited.
      rest_days: coffee ? restDaysAt(coffee, startedAt) : null,
      rated_at: null,
      logged_by: profile.id,
      stars: null,
      stars2: null,
      taster1: null,
      taster2: null,
      acidity: null,
      sweetness: null,
      body: null,
      clarity: null,
      note: null,
    };
    // For a split brew, also create a sibling row directed at the other member.
    // They see it as a normal pending brew on their device and rate it through
    // the unchanged StepRate flow. rate_for is cleared when they save their rating,
    // just like any other handoff. session_id links the two rows for the read layer
    // (TasterFaceoff pairing, Journal merge).
    if (sessionId && otherMember) {
      const siblingBrew: Brew = {
        id: crypto.randomUUID(),
        household_id: profile.household_id,
        coffee_id: coffee!.id,
        brewer_id: b.id,
        dose: r.dose,
        water: r.water,
        temp: r.temp,
        grind: r.grind,
        water_type: r.water_type,
        bypass: r.bypass || 0,
        ratio: (r.water + (r.bypass || 0)) / r.dose,
        pending: true,
        rate_for: otherMember.id,
        session_id: sessionId,
        guest: false,
        started_at: String(startedAt),
        rest_days: coffee ? restDaysAt(coffee, startedAt) : null,
        rated_at: null,
        logged_by: profile.id,
        stars: null,
        stars2: null,
        taster1: null,
        taster2: null,
        acidity: null,
        sweetness: null,
        body: null,
        clarity: null,
        note: null,
      };
      lastLogged.current = [newBrew, siblingBrew];
    } else {
      lastLogged.current = [newBrew];
    }

    setLoggedAudience(audience);
    setRateTarget(newBrew);
    // Last-dose check: `brews` doesn't yet include the just-logged row(s), and a
    // split still draws one physical dose. Less than a serving left → probably done.
    const lastDose = !!coffee && activeGrams(coffee, brews) - r.dose < config.serving_grams;
    finishRef.current = lastDose ? coffee : null;
    setFinishCandidate(finishRef.current);
    setStep("logged");
    if (logTimer.current) clearTimeout(logTimer.current);
    void persistLogged();
  }

  /** Insert the brew(s) of the last log attempt and gate the confirmation on
   *  the result: auto-dismiss only after the DB write is confirmed; on failure
   *  the screen flips to a retry state instead of melting away. In unauthed
   *  demo mode writes are local-only by design, so treat them as done. */
  async function persistLogged() {
    setSaveState("saving");
    const oks = await Promise.all(lastLogged.current.map((b) => startBrew(b)));
    const ok = !authed || oks.every(Boolean);
    setSaveState(ok ? "saved" : "failed");
    if (ok) {
      // Auto-archive when the last dose left less than one serving — inform on
      // screen, no prompt. Safe to re-run (idempotent) on Retry.
      if (finishRef.current) updateCoffee({ ...finishRef.current, archived: true });
      if (logTimer.current) clearTimeout(logTimer.current);
      logTimer.current = setTimeout(backHome, 4200);
    }
  }

  function openRate(brew: Brew) {
    setRateTarget(brew);
    const c = coffeeById(brew.coffee_id);
    const b = brewerById(brew.brewer_id);
    if (c) setCoffee(c);
    if (b) setBrewer(b);
    setRecipe({
      dose: brew.dose,
      water: brew.water,
      temp: brew.temp,
      grind: brew.grind,
      water_type: brew.water_type,
      bypass: brew.bypass || 0,
      ratio: brew.ratio,
    });
    setStep("rate");
  }

  function backHome() {
    if (logTimer.current) clearTimeout(logTimer.current);
    setStep("what");
    setCoffee(coffees[0] ?? null);
    setRateTarget(null);
    setLoggedAudience("me");
    setFinishCandidate(null);
    finishRef.current = null;
  }

  function saveRating(rating: object) {
    setStep("done");
    if (logTimer.current) clearTimeout(logTimer.current);
    logTimer.current = setTimeout(backHome, 1600);
    if (!rateTarget) return;
    // Show "Rated." optimistically, but if the write finally fails (state is
    // already rolled back; the banner shows Retry) bounce back to the rate
    // step so it doesn't melt away looking saved.
    void rateBrew(rateTarget.id, rating as Partial<Brew>).then((ok) => {
      if (!ok && authed) {
        if (logTimer.current) clearTimeout(logTimer.current);
        setStep("rate");
      }
    });
  }

  function discardRating() {
    if (rateTarget) dismissBrew(rateTarget.id);
    backHome();
  }

  return (
    <div className="screen" ref={scrollRef}>
      {step === "what" && (
        <StepWhat
          coffees={coffees}
          brews={brews}
          config={config}
          profile={profile}
          members={members}
          onPick={(c) => { setCoffee(c); setStep("how"); }}
          onRate={openRate}
          onSend={(b) => { if (otherMember) updateBrew(b.id, { rate_for: otherMember.id }); }}
          onOpenBrew={setDetailBrew}
          onGotoShelf={onGotoShelf}
        />
      )}
      {step === "how" && coffee && (
        <StepHow
          coffee={coffee}
          brews={brews}
          config={config}
          canSplit={!!otherMember}
          splitPartnerName={otherMember?.name}
          onChangeCoffee={() => setStep("what")}
          onLog={logCoffee}
        />
      )}
      {step === "rate" && coffee && brewer && recipe && rateTarget && (
        <StepRate
          coffee={coffee}
          brewer={brewer}
          recipe={recipe}
          brew={rateTarget}
          profile={profile}
          config={config}
          onSave={saveRating}
          onDiscard={discardRating}
        />
      )}
      {step === "logged" && saveState === "failed" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
          <div className="rise" style={{ width: 76, height: 76, borderRadius: "50%", background: "color-mix(in srgb, var(--bad, #b65f4f) 18%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--bad, #b65f4f)" }}>
            <Icon name="close" size={36} stroke={2.2} />
          </div>
          <div className="rise rise-1" style={{ fontSize: 20, fontWeight: 600, marginTop: 18 }}>Couldn&apos;t save this brew</div>
          <div className="rise rise-2 mono" style={{ fontSize: 13, color: "var(--ink-faint)", marginTop: 6 }}>{coffee && coffee.name}</div>
          <div className="rise rise-2" style={{ fontSize: 14, color: "var(--ink-dim)", lineHeight: 1.5, maxWidth: 260, marginTop: 12 }}>
            It isn&apos;t in your log yet. Check your connection and retry.
          </div>
          <button className="btn btn-accent rise rise-3" onClick={() => void persistLogged()} style={{ marginTop: 22, width: "auto", padding: "0 26px", display: "inline-flex" }}>
            Retry
          </button>
          <button className="rise rise-3" onClick={backHome} style={{
            marginTop: 14, background: "none", border: "none", cursor: "pointer",
            color: "var(--ink-faint)", fontFamily: "var(--font-ui)", fontSize: 13.5, fontWeight: 600,
            textDecoration: "underline", textUnderlineOffset: 3,
          }}>
            Discard this brew
          </button>
        </div>
      )}
      {step === "logged" && saveState !== "failed" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
          <div style={{ position: "relative", width: 76, height: 76, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="done-ring" style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid var(--accent)" }} />
            <div className="rise" style={{ width: 76, height: 76, borderRadius: "50%", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
              <Icon name="check" size={40} stroke={2.2} />
            </div>
          </div>
          <div className="rise rise-1" style={{ fontSize: 20, fontWeight: 600, marginTop: 18 }}>Logged.</div>
          <div className="rise rise-2 mono" style={{ fontSize: 13, color: "var(--ink-faint)", marginTop: 6 }}>{coffee && coffee.name}</div>
          <div className="rise rise-2" style={{ fontSize: 14, color: "var(--ink-dim)", lineHeight: 1.5, maxWidth: 260, marginTop: 12 }}>
            {loggedAudience === "guest"
              ? "Brewed for your guest — no rating needed."
              : loggedAudience === "partner" && otherMember
                ? <>Sent a cup to <strong>{otherMember.name}</strong> to rate.</>
                : loggedAudience === "split" && otherMember
                  ? <>Sent a cup to <strong>{otherMember.name}</strong> to rate — yours is waiting whenever you&apos;re ready.</>
                  : "We'll keep it on your home screen so you can rate it once you've had a cup."}
          </div>
          {finishCandidate && (
            <div className="rise rise-3 mono" style={{ marginTop: 16, fontSize: 13, color: "var(--ink-faint)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="check" size={13} stroke={2.2} /> Marked <strong style={{ color: "var(--ink-dim)", fontWeight: 600 }}>{finishCandidate.name}</strong> finished
            </div>
          )}
          {/* "Rate now" only makes sense when you have a cup to rate (me or split). */}
          {(loggedAudience === "me" || loggedAudience === "split") && (
            <button className="rise rise-3" onClick={() => { if (logTimer.current) clearTimeout(logTimer.current); setStep("rate"); }} style={{
              marginTop: 22, background: "none", border: "none", cursor: "pointer",
              color: "var(--ink-faint)", fontFamily: "var(--font-ui)", fontSize: 13.5, fontWeight: 600,
              display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "underline", textUnderlineOffset: 3,
            }}>
              Already had it? Rate now
            </button>
          )}
        </div>
      )}
      {step === "done" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ position: "relative", width: 76, height: 76, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div className="done-ring" style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid var(--accent)" }} />
            <div className="rise" style={{ width: 76, height: 76, borderRadius: "50%", background: "var(--accent-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
              <Icon name="check" size={40} stroke={2.2} />
            </div>
          </div>
          <div className="rise rise-1" style={{ fontSize: 19, fontWeight: 600 }}>Rated.</div>
          <div className="rise rise-2 mono" style={{ fontSize: 13, color: "var(--ink-dim)" }}>{coffee && coffee.name}</div>
        </div>
      )}

      {/* BrewDetail sheet — opened by tapping a day cell on the recent strip */}
      <BrewDetail
        brew={detailBrew}
        coffees={coffees}
        brews={brews}
        config={config}
        onClose={() => setDetailBrew(null)}
        onUpdate={updateBrew}
        onDelete={dismissBrewSession}
      />
    </div>
  );
}
