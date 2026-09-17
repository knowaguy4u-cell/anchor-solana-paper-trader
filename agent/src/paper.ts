// paper.ts — paper portfolio + execution simulator.
// No real transactions. Fills are simulated at quoted price with a fixed
// slippage assumption, stated openly. Live mode (real signing) is deliberately
// NOT implemented here: any real-money path requires the operator's explicit
// key and a separate, audited signer module.

export interface Position {
  symbol: string;
  qty: number;
  entryPrice: number;
  entryTs: number;
}

export interface Portfolio {
  cashUsd: number;
  positions: Map<string, Position>;
}

export const SLIPPAGE_PCT = 0.001; // 0.1% assumed slippage per fill
export const TAKE_PROFIT_PCT = 0.04; // +4% take profit
export const STOP_LOSS_PCT = 0.02; // -2% stop loss

export function createPortfolio(startingCashUsd: number): Portfolio {
  return { cashUsd: startingCashUsd, positions: new Map() };
}

export function equity(pf: Portfolio, prices: Map<string, number>): number {
  let total = pf.cashUsd;
  for (const [symbol, pos] of pf.positions) {
    const px = prices.get(symbol);
    if (px !== undefined) total += pos.qty * px;
  }
  return total;
}

/** Simulate a buy at quoted price + slippage. Returns filled qty or 0. */
export function simBuy(
  pf: Portfolio,
  symbol: string,
  notionalUsd: number,
  quotePrice: number,
  ts: number
): number {
  if (notionalUsd <= 0 || notionalUsd > pf.cashUsd) return 0;
  const fillPrice = quotePrice * (1 + SLIPPAGE_PCT);
  const qty = notionalUsd / fillPrice;
  pf.cashUsd -= notionalUsd;
  const existing = pf.positions.get(symbol);
  if (existing) {
    const newQty = existing.qty + qty;
    existing.entryPrice = (existing.entryPrice * existing.qty + fillPrice * qty) / newQty;
    existing.qty = newQty;
  } else {
    pf.positions.set(symbol, { symbol, qty, entryPrice: fillPrice, ts });
  }
  return qty;
}

/** Simulate a full close of a position at quoted price - slippage. */
export function simSell(
  pf: Portfolio,
  symbol: string,
  quotePrice: number
): { proceeds: number; pnlPct: number } | null {
  const pos = pf.positions.get(symbol);
  if (!pos) return null;
  const fillPrice = quotePrice * (1 - SLIPPAGE_PCT);
  const proceeds = pos.qty * fillPrice;
  const pnlPct = (fillPrice - pos.entryPrice) / pos.entryPrice;
  pf.cashUsd += proceeds;
  pf.positions.delete(symbol);
  return { proceeds, pnlPct };
}

/** Check take-profit / stop-loss exits against current prices. */
export function riskExits(
  pf: Portfolio,
  prices: Map<string, number>
): { symbol: string; reason: string; pnlPct: number }[] {
  const exits: { symbol: string; reason: string; pnlPct: number }[] = [];
  for (const [symbol, pos] of pf.positions) {
    const px = prices.get(symbol);
    if (px === undefined) continue;
    const pnl = (px - pos.entryPrice) / pos.entryPrice;
    if (pnl >= TAKE_PROFIT_PCT) {
      const r = simSell(pf, symbol, px);
      if (r) exits.push({ symbol, reason: `take-profit +${(pnl * 100).toFixed(1)}%`, pnlPct: r.pnlPct });
    } else if (pnl <= -STOP_LOSS_PCT) {
      const r = simSell(pf, symbol, px);
      if (r) exits.push({ symbol, reason: `stop-loss ${(pnl * 100).toFixed(1)}%`, pnlPct: r.pnlPct });
    }
  }
  return exits;
}
