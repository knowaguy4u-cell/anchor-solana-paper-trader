# ANCHOR — autonomous Solana paper-trading agent

Built for the **Steve Agent Arena** (OOBE Protocol · Superteam Earn · $500 USDC).

Anchor is Steve's disciplined sibling: where Steve hunts perp trades, Anchor
protects capital. It runs the full autonomous-agent loop every cycle —

**Intent → Market data → Analysis → Policy checks → Simulation → Journal**

— with one hard safety property: **this build only ever paper-trades.** There
is no code path that can move real funds. Any live-money deployment requires
the operator's key plus a separately audited signer module.

## What it does

- Ingests live Solana token prices (SOL, JUP, RAY, ORCA, BONK) via the free
  Jupiter price API — no key required. Falls back to a deterministic seeded
  snapshot if the API is unreachable (labeled `fallback` in the journal).
- Generates momentum signals from its own price observations, each carrying a
  confidence score. Weak signals are gated out, not traded.
- Enforces a strict risk policy on every proposed action:
  - max 25% of equity in any single position
  - max 3 open positions
  - **kill switch**: all trading halts beyond 8% peak-to-trough drawdown
  - mandatory 3-cycle cooldown after 2 consecutive losing cycles
  - take-profit +4% / stop-loss −2% on every position
- Simulates fills at quoted price with a stated 0.1% slippage assumption.
- Writes an append-only JSONL trade journal every cycle: intent, prices,
  signals, policy verdict, actions, equity, drawdown. The journal is the
  agent's memory and its proof-of-work.

## Run it

Requires Node ≥ 22.6 (uses native type stripping — no build step).

```bash
cd agent
node demo/run-demo.ts        # scripted 18-cycle demo: chop → rally → selloff
node src/agent.ts --cycles=6 # live loop, paper mode, real Jupiter prices
node src/agent.ts --cycles=6 --live   # same, explicitly requesting live prices
```

The demo prints a readable transcript and writes `demo-journal.jsonl`.
Sample output (real run, 2026-09-17):

```
--- regime: CHOP (sideways, noisy) ---
cycle 1 | equity $1000.00 | drawdown 0.00%
   - HOLD: no signal cleared the policy bar
--- regime: RALLY (steady uptrend) ---
cycle 11 | equity $999.75 | drawdown 0.02%
   - BUY SOL 1.5559 @ $160.5210 (signal 1.00)
--- regime: SELLOFF (sharp drawdown) ---
cycle 13 | equity $934.29 | drawdown 6.57%
   - SELL SOL (stop-loss -13.3%)
   - SELL JUP (stop-loss -12.9%)
```

Note the chop regime: six straight HOLDs. Discipline is the feature — most
agents overtrade noise; Anchor waits for a signal that clears its bar.

## Architecture

```
agent/src/
  agent.ts     main loop: intent → data → analysis → policy → sim → journal
  market.ts    Jupiter price client + deterministic fallback
  strategy.ts  momentum signals with confidence scores
  policy.ts    risk engine: position limits, kill switch, cooldowns
  paper.ts     paper portfolio + fill simulator (0.1% slippage)
  journal.ts   append-only JSONL journal
agent/demo/
  run-demo.ts  18-cycle scripted demo across 3 market regimes
```

## Mapping to the OOBE stack

Anchor is designed to drop into OOBE's SAP MCP architecture: the market,
strategy, and policy modules map 1:1 onto MCP tools (`market_snapshot`,
`signal_compute`, `policy_check`), the journal maps onto SAP session ledgers,
and the paper executor is the stand-in for the SAP signing proxy — user-held
keys, never agent-held. See `LAUNCH_RUNBOOK.md` for the path to a hosted
SAP MCP deployment.

## Honest limitations

- The strategy is a demonstrator (momentum on self-observed prices), not a
  production edge. It is labeled as such in code and journal.
- Stop-losses are evaluated per cycle; a gap move between cycles can skip
  past the stop (visible in the demo: −13.3% exits against a −2% stop).
  That gap risk is real and disclosed, not hidden.
- Fallback prices are synthetic and seeded; live mode uses real Jupiter data.
- Paper trading ignores market impact, borrow costs, and funding rates.
