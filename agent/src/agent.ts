// agent.ts — Anchor's main loop.
// One cycle = Intent -> Market data -> Analysis -> Policy checks ->
// Simulation -> Journal. Mirrors the OOBE "Steve" flow, with the safety
// property made explicit: this build only ever paper-trades. Any live-money
// path requires the operator's key and a separate audited signer; there is
// no code path here that can move real funds.

import { fetchQuotes, fallbackQuotes } from "./market.ts";
import { allSignals, updateMemory, type PriceMemory } from "./strategy.ts";
import {
  DEFAULT_POLICY,
  checkPolicy,
  updatePolicyState,
  freshPolicyState,
  type PolicyState,
} from "./policy.ts";
import {
  createPortfolio,
  equity,
  simBuy,
  riskExits,
  TAKE_PROFIT_PCT,
  STOP_LOSS_PCT,
  SLIPPAGE_PCT,
  type Portfolio,
} from "./paper.ts";
import { Journal } from "./journal.ts";

export interface AgentConfig {
  startingCashUsd: number;
  journalPath: string;
  useLivePrices: boolean;
  seed: number;
}

export interface CycleResult {
  cycle: number;
  equityUsd: number;
  drawdownPct: number;
  actions: string[];
  halted: boolean;
}

const INTENT =
  "Grow the paper portfolio while keeping peak-to-trough drawdown under 8%, " +
  "no single position above 25% of equity, and a mandatory cooldown after " +
  "consecutive losing cycles. Capital preservation first.";

export class AnchorAgent {
  private mem = new Map<string, PriceMemory>();
  private pf: Portfolio;
  private policy: PolicyState;
  private journal: Journal;
  private cfg: AgentConfig;
  private cycle = 0;

  constructor(cfg: AgentConfig) {
    this.cfg = cfg;
    this.pf = createPortfolio(cfg.startingCashUsd);
    this.policy = freshPolicyState(cfg.startingCashUsd);
    this.journal = new Journal(cfg.journalPath);
  }

  async runCycle(demoDriftPct = 0): Promise<CycleResult> {
    this.cycle += 1;
    const actions: string[] = [];

    // 1. Market data
    const quotes = this.cfg.useLivePrices
      ? await fetchQuotes(this.cfg.seed + this.cycle)
      : fallbackQuotes(this.cfg.seed + this.cycle, demoDriftPct);
    const priceSource = quotes[0]?.source ?? "fallback";
    const prices = new Map(quotes.map((q) => [q.symbol, q.priceUsd]));
    updateMemory(this.mem, quotes);

    // 2. Analysis
    const signals = allSignals(this.mem);

    // 3+4. Risk exits first (take-profit / stop-loss are policy, not signals)
    const exits = riskExits(this.pf, prices);
    let cyclePnlPct = 0;
    for (const e of exits) {
      actions.push(`SELL ${e.symbol} (${e.reason})`);
      cyclePnlPct += e.pnlPct;
      if (e.pnlPct < 0) this.policy.consecutiveLosses += 1;
    }

    // 5. New entries: strongest long signal, gated by policy
    const eq = equity(this.pf, prices);
    const longs = signals
      .filter((s) => s.direction === "long" && !this.pf.positions.has(s.symbol))
      .sort((a, b) => b.strength - a.strength);
    if (longs.length > 0 && !this.policy.halted) {
      const best = longs[0];
      const verdict = checkPolicy(DEFAULT_POLICY, this.policy, eq, this.pf.positions.size, {
        symbol: best.symbol,
        side: "buy",
        notionalPct: DEFAULT_POLICY.maxPositionPct,
        signalStrength: best.strength,
      });
      if (verdict.ok) {
        const notional = eq * DEFAULT_POLICY.maxPositionPct;
        const qty = simBuy(this.pf, best.symbol, notional, prices.get(best.symbol)!, Date.now());
        if (qty > 0)
          actions.push(
            `BUY ${best.symbol} ${qty.toFixed(4)} @ $${prices.get(best.symbol)!.toFixed(4)} ` +
              `(signal ${best.strength.toFixed(2)})`
          );
      } else {
        actions.push(`BLOCKED buy ${best.symbol}: ${verdict.reasons.join("; ")}`);
      }
    } else if (longs.length > 0 && this.policy.halted) {
      actions.push(`BLOCKED buy ${longs[0].symbol}: kill switch engaged`);
    }

    // 6. Policy state update + journal
    const newEq = equity(this.pf, prices);
    const pnlPct = (newEq - eq) / eq;
    this.policy = updatePolicyState(DEFAULT_POLICY, this.policy, newEq, pnlPct + cyclePnlPct);
    const drawdownPct = ((this.policy.peakEquity - newEq) / this.policy.peakEquity) * 100;

    this.journal.append({
      ts: new Date().toISOString(),
      cycle: this.cycle,
      mode: "paper",
      intent: INTENT,
      prices: Object.fromEntries(prices),
      priceSource,
      signals: signals.map((s) => ({
        symbol: s.symbol,
        direction: s.direction,
        strength: Number(s.strength.toFixed(3)),
        reason: s.reason,
      })),
      policyVerdict: { ok: true, reasons: [] },
      actions: actions.map((a) => ({ type: a.split(" ")[0], detail: a })),
      equityUsd: Number(newEq.toFixed(2)),
      drawdownPct: Number(drawdownPct.toFixed(2)),
      notes:
        `slippage ${(SLIPPAGE_PCT * 100).toFixed(1)}% assumed; ` +
        `TP +${TAKE_PROFIT_PCT * 100}% / SL -${STOP_LOSS_PCT * 100}%`,
    });

    if (actions.length === 0) actions.push("HOLD: no signal cleared the policy bar");
    return {
      cycle: this.cycle,
      equityUsd: Number(newEq.toFixed(2)),
      drawdownPct: Number(drawdownPct.toFixed(2)),
      actions,
      halted: this.policy.halted,
    };
  }

  get journalFile(): string {
    return this.journal.file;
  }
}

// CLI: `node src/agent.ts [--cycles N] [--live]`
// Only runs when this file is the entry point (importing it is side-effect free).
import { pathToFileURL } from "node:url";
const isMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();
if (isMain) {
  const args = process.argv.slice(2);
  const cycles = Number(args.find((a) => a.startsWith("--cycles="))?.split("=")[1] ?? "6");
  const live = args.includes("--live");
  const agent = new AnchorAgent({
    startingCashUsd: 1000,
    journalPath: "./journal.jsonl",
    useLivePrices: live,
    seed: 7,
  });
  for (let i = 0; i < cycles; i++) {
    const r = await agent.runCycle();
    console.log(
      `cycle ${r.cycle} | equity $${r.equityUsd} | drawdown ${r.drawdownPct}%${r.halted ? " | HALTED" : ""}`
    );
    for (const a of r.actions) console.log(`   - ${a}`);
  }
  console.log(`journal: ${agent.journalFile}`);
}
