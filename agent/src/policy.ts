// policy.ts — the risk engine. Every proposed action passes through here.
// Policy is the whole personality of Anchor: capital preservation first.
// Nothing executes unless every check below returns { ok: true }.

export interface PolicyConfig {
  maxPositionPct: number; // max % of equity in one token
  maxOpenPositions: number;
  killSwitchDrawdownPct: number; // halt all trading beyond this peak-to-trough
  cooldownAfterLosses: number; // losing cycles before mandatory cooldown
  cooldownCycles: number;
  minSignalStrength: number;
}

export const DEFAULT_POLICY: PolicyConfig = {
  maxPositionPct: 0.25,
  maxOpenPositions: 3,
  killSwitchDrawdownPct: 0.08,
  cooldownAfterLosses: 2,
  cooldownCycles: 3,
  minSignalStrength: 0.55,
};

export interface PolicyState {
  peakEquity: number;
  consecutiveLosses: number;
  cooldownRemaining: number;
  halted: boolean;
}

export interface PolicyVerdict {
  ok: boolean;
  reasons: string[];
}

export interface ProposedTrade {
  symbol: string;
  side: "buy" | "sell";
  notionalPct: number; // fraction of equity
  signalStrength: number;
}

export function checkPolicy(
  cfg: PolicyConfig,
  st: PolicyState,
  equity: number,
  openPositions: number,
  trade: ProposedTrade
): PolicyVerdict {
  const reasons: string[] = [];
  if (st.halted) reasons.push("KILL SWITCH engaged: drawdown exceeded limit — all trading halted");
  if (st.cooldownRemaining > 0)
    reasons.push(`cooldown active: ${st.cooldownRemaining} cycle(s) remaining after losses`);
  if (trade.signalStrength < cfg.minSignalStrength)
    reasons.push(
      `signal strength ${trade.signalStrength.toFixed(2)} < minimum ${cfg.minSignalStrength}`
    );
  if (trade.side === "buy") {
    if (trade.notionalPct > cfg.maxPositionPct)
      reasons.push(
        `position ${Math.round(trade.notionalPct * 100)}% > max ${Math.round(cfg.maxPositionPct * 100)}% per token`
      );
    if (openPositions >= cfg.maxOpenPositions)
      reasons.push(`already at max ${cfg.maxOpenPositions} open positions`);
  }
  return { ok: reasons.length === 0, reasons };
}

export function updatePolicyState(
  cfg: PolicyConfig,
  st: PolicyState,
  equity: number,
  cyclePnlPct: number
): PolicyState {
  const next = { ...st };
  if (equity > next.peakEquity) next.peakEquity = equity;
  const drawdown = (next.peakEquity - equity) / next.peakEquity;
  if (drawdown >= cfg.killSwitchDrawdownPct) next.halted = true;
  if (cyclePnlPct < 0) next.consecutiveLosses += 1;
  else if (cyclePnlPct > 0) next.consecutiveLosses = 0;
  if (next.consecutiveLosses >= cfg.cooldownAfterLosses && next.cooldownRemaining === 0) {
    next.cooldownRemaining = cfg.cooldownCycles;
  }
  if (next.cooldownRemaining > 0 && cyclePnlPct >= 0) next.cooldownRemaining -= 1;
  return next;
}

export function freshPolicyState(startingEquity: number): PolicyState {
  return { peakEquity: startingEquity, consecutiveLosses: 0, cooldownRemaining: 0, halted: false };
}
