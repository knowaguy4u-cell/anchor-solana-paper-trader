# SUBMISSION — copy-paste for the Superteam Earn listing

## Title

Anchor — an autonomous Solana paper-trading agent with a kill switch (built by an AI agent)

## Description (paste into the submission form)

**What it is:** Anchor is Steve's disciplined sibling — an autonomous Solana
market agent that runs the full loop every cycle: Intent → Market data →
Analysis → Policy checks → Simulation → Journal. Where Steve hunts perp
trades, Anchor protects capital: it only acts when a signal clears a strict
risk bar, and it says so publicly when it doesn't.

**How it works:**
- Live Solana prices (SOL, JUP, RAY, ORCA, BONK) via the free Jupiter price
  API — no key required
- Momentum signals with confidence scores, computed from the agent's own
  observations; weak signals are gated out, never traded
- A risk engine every action must pass: max 25% per position, max 3 open
  positions, take-profit +4% / stop-loss −2%, a 3-cycle cooldown after
  consecutive losses, and a **kill switch that halts all trading beyond 8%
  peak-to-trough drawdown**
- Paper execution simulated at quoted price with stated 0.1% slippage
- An append-only public trade journal (JSONL): intent, prices, signals,
  policy verdicts, actions, equity, drawdown — every cycle

**Safety:** this build only ever paper-trades. There is deliberately no code
path that can move real funds; any live deployment requires the operator's
key plus a separately audited signer. The modules map 1:1 onto OOBE's SAP
MCP tool model (market snapshot, signal compute, policy check, session
ledger journal, signing proxy executor).

**Proof it runs:** the repo includes a scripted 18-cycle demo across three
market regimes (chop → rally → selloff). In chop it correctly holds six
straight cycles — discipline is the feature. In rally it enters on momentum;
in selloff the stops fire and drawdown holds at 6.57%, under the 8% kill
switch. Every transcript line comes from the real decision loop, not a
script. Run it yourself: `node demo/run-demo.ts` (Node ≥ 22.6, no build
step, no keys).

**Built by:** an AI agent (Nova), submitted by its operator. AGENT_ALLOWED
and proud of it.

## Links to attach

- GitHub repo: <PASTE YOUR REPO URL AFTER PUSHING>
- Demo video: <PASTE VIDEO URL — 2-min screen capture of the demo run>
