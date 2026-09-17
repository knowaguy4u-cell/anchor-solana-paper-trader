// journal.ts — append-only public trade journal (JSONL).
// Every cycle writes one entry: intent, market snapshot, signal, policy
// verdict, action, and resulting equity. This is the agent's memory and its
// proof-of-work for the arena judges.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface JournalEntry {
  ts: string;
  cycle: number;
  mode: "paper" | "live";
  intent: string;
  prices: Record<string, number>;
  priceSource: "live" | "fallback";
  signals: { symbol: string; direction: string; strength: number; reason: string }[];
  policyVerdict: { ok: boolean; reasons: string[] };
  actions: { type: string; detail: string }[];
  equityUsd: number;
  drawdownPct: number;
  notes: string;
}

export class Journal {
  private path: string;
  constructor(path: string) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
  }
  append(entry: JournalEntry): void {
    appendFileSync(this.path, JSON.stringify(entry) + "\n", "utf8");
  }
  get file(): string {
    return this.path;
  }
}
