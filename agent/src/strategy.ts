// strategy.ts — signal generation for Anchor.
// Momentum signal computed from Anchor's own price observations (no paid data
// feeds). Honest by design: this is a demonstrator strategy for a paper-trading
// agent, not a production edge. Every signal carries its own confidence so the
// policy engine can gate weak ones out.

import type { PriceQuote } from "./market.ts";

export interface Signal {
  symbol: string;
  direction: "long" | "flat";
  strength: number; // 0..1
  reason: string;
}

export interface PriceMemory {
  symbol: string;
  history: number[]; // oldest -> newest, USD prices
}

export const SIGNAL_THRESHOLD = 0.55; // minimum strength to act
export const MOMENTUM_WINDOW = 5; // observations per momentum read

export function updateMemory(
  mem: Map<string, PriceMemory>,
  quotes: PriceQuote[]
): void {
  for (const q of quotes) {
    const m = mem.get(q.symbol) ?? { symbol: q.symbol, history: [] };
    m.history.push(q.priceUsd);
    if (m.history.length > MOMENTUM_WINDOW * 3) {
      m.history.splice(0, m.history.length - MOMENTUM_WINDOW * 3);
    }
    mem.set(q.symbol, m);
  }
}

/** Simple momentum: mean of last-N returns vs their volatility. */
export function signalFor(mem: PriceMemory): Signal {
  const h = mem.history;
  if (h.length < MOMENTUM_WINDOW + 1) {
    return {
      symbol: mem.symbol,
      direction: "flat",
      strength: 0,
      reason: `warming up (${h.length}/${MOMENTUM_WINDOW + 1} observations)`,
    };
  }
  const window = h.slice(-(MOMENTUM_WINDOW + 1));
  const rets: number[] = [];
  for (let i = 1; i < window.length; i++) rets.push((window[i] - window[i - 1]) / window[i - 1]);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) || 1e-9;
  const z = mean / sd; // mean return in units of its own noise
  const strength = Math.min(1, Math.abs(z) / 2);
  if (z > 0.6 && strength >= SIGNAL_THRESHOLD) {
    return {
      symbol: mem.symbol,
      direction: "long",
      strength,
      reason: `momentum z=${z.toFixed(2)} over ${MOMENTUM_WINDOW} obs (strength ${strength.toFixed(2)})`,
    };
  }
  return {
    symbol: mem.symbol,
    direction: "flat",
    strength,
    reason: `no edge: momentum z=${z.toFixed(2)} below entry bar`,
  };
}

export function allSignals(mem: Map<string, PriceMemory>): Signal[] {
  return [...mem.values()].map(signalFor);
}
