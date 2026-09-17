// market.ts — price ingestion for Anchor.
// Live: Jupiter price API (free, no key). Fallback: deterministic seeded snapshot
// so the demo always runs, even offline. The fallback is clearly labeled.

export interface PriceQuote {
  symbol: string;
  mint: string;
  priceUsd: number;
  source: "live" | "fallback";
  ts: number;
}

export const TRACKED_TOKENS: { symbol: string; mint: string }[] = [
  { symbol: "SOL", mint: "So11111111111111111111111111111111111111112" },
  { symbol: "JUP", mint: "JUPyiwrYJFskUPiHa7h5LXNKWPgcYPGaZy5hWhD4m5v" },
  { symbol: "RAY", mint: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R" },
  { symbol: "ORCA", mint: "orcaEKTdK7LKz57vaAYr9Qe2TeBbfUVqAd6pPhb9YQ1" },
  { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaK7pPBk" },
];

// Seeded PRNG (mulberry32) so fallback prices are deterministic.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FALLBACK_BASE: Record<string, number> = {
  SOL: 142.5,
  JUP: 0.412,
  RAY: 2.87,
  ORCA: 1.94,
  BONK: 0.0000182,
};

export function fallbackQuotes(seed = 42, driftPct = 0): PriceQuote[] {
  const rand = mulberry32(seed);
  const ts = Date.now();
  return TRACKED_TOKENS.map(({ symbol, mint }) => {
    // Random walk around base: ±3% noise plus an applied drift (used by the demo
    // to simulate trending markets across cycles).
    const noise = (rand() - 0.5) * 0.06;
    const priceUsd = FALLBACK_BASE[symbol] * (1 + noise + driftPct);
    return { symbol, mint, priceUsd, source: "fallback", ts };
  });
}

export async function fetchQuotes(seed = 42): Promise<PriceQuote[]> {
  const ids = TRACKED_TOKENS.map((t) => t.mint).join(",");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(
      `https://lite-api.jup.ag/price/v3?ids=${ids}`,
      { signal: ctrl.signal, headers: { accept: "application/json" } }
    );
    if (!res.ok) throw new Error(`Jupiter HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, { usdPrice?: number }>;
    const ts = Date.now();
    const quotes = TRACKED_TOKENS.map(({ symbol, mint }) => {
      const p = data[mint]?.usdPrice;
      if (typeof p !== "number" || !(p > 0)) throw new Error(`no price for ${symbol}`);
      return { symbol, mint, priceUsd: p, source: "live" as const, ts };
    });
    return quotes;
  } catch {
    return fallbackQuotes(seed);
  } finally {
    clearTimeout(timer);
  }
}
