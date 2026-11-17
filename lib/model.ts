// The token radar's model: one frozen snapshot of the protocol universe in, one ranked board out.
//
// A protocol on the board records no token yet, so there is no market price to read: the radar's job
// is to say what a token would be worth if it launched, from the only figures the snapshot carries —
// how much value the protocol already custodies (TVL), how fast that value is growing, and how long
// the protocol has run without issuing anything.
//
//   base    = tvl_usd x category_multiple[category]
//   growth  = clamp(change_7d, -50, 100) per cent   ->   1 + growth/100 x 0.35
//   premium = 1.25 - min(age_days, 1095)/1095 x 0.35   (younger protocol, higher launch premium)
//   size    = clamp(0.45 + log10(tvl/1e5) x 0.18, 0.45, 1.15)   (deeper protocol, deeper market)
//   implied = max(1, round(base x growth x premium x size))
//
// Every constant is stated on the dashboard, and the same function scores every row: no protocol name
// is ever special-cased. Three flags — a hard drawdown, a very young listing, a small TVL — set the
// row's risk and lower its confidence; they never change the implied value, so the ranking stays the
// model's arithmetic and the risk stays a reader's warning.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export type Risk = 'low' | 'medium' | 'high';

export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  premium_max: number;
  premium_range: number;
  age_days_cap: number;
  unknown_age_premium: number;
  size_base: number;
  size_weight: number;
  size_min: number;
  size_max: number;
  risk_drawdown_pct: number;
  risk_young_days: number;
  risk_small_usd: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.35,
  growth_floor: -50,
  growth_cap: 100,
  premium_max: 1.25,
  premium_range: 0.35,
  age_days_cap: 1095,
  unknown_age_premium: 1.05,
  size_base: 0.45,
  size_weight: 0.18,
  size_min: 0.45,
  size_max: 1.15,
  risk_drawdown_pct: -20,
  risk_young_days: 120,
  risk_small_usd: 10_000_000,
};

export const MODEL_VERSION = 'radar-2';

// What a protocol of each category is worth as a multiple of its TVL if it issues a token. A DEX's
// TVL is mostly other people's liquidity and prices thin; an RWA book or a lending market carries
// its value on the balance sheet. The map is a field lookup, not a name list.
export const CATEGORY_MULTIPLE: Record<string, number> = {
  'Dexs': 0.22,
  'Lending': 0.30,
  'CDP': 0.18,
  'Bridge': 0.35,
  'Canonical Bridge': 0.30,
  'RWA': 0.45,
  'Risk Curators': 0.20,
  'Onchain Capital Allocator': 0.18,
  'Yield': 0.25,
  'Yield Aggregator': 0.22,
  'Derivatives': 0.28,
  'Perpetuals': 0.30,
  'Liquid Staking': 0.12,
  'Liquid Restaking': 0.12,
  'Restaked BTC': 0.12,
  'Insurance': 0.22,
  'Prediction Market': 0.25,
  'Algo-Stables': 0.15,
  'Synthetics': 0.20,
  'Options': 0.24,
  'Launchpad': 0.20,
  'Farm': 0.18,
  'Services': 0.16,
  'Gaming': 0.28,
  'NFT Marketplace': 0.24,
  'Social': 0.20,
  'Privacy': 0.26,
  'Oracle': 0.30,
  'Indexes': 0.18,
  'SoFi': 0.28,
  'Telegram Bot': 0.22,
  'Cross Chain': 0.30,
  'Meme': 0.10,
};
export const DEFAULT_MULTIPLE = 0.20;

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 30;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  risk: Risk;
  confidence: number;
  model: {
    category_multiple: number;
    base_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    premium_multiplier: number;
    size_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  risk: Risk;
  confidence: number;
  base_usd: number;
  growth_multiplier: number;
  premium_multiplier: number;
  size_multiplier: number;
  below_floor: boolean;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_to_tvl: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  category_multiple: Record<string, number>;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function multipleFor(category: string | null): number {
  if (category === null) return DEFAULT_MULTIPLE;
  return CATEGORY_MULTIPLE[category] ?? DEFAULT_MULTIPLE;
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants = MODEL) {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growth / 100) * model.growth_weight;

  const premium = age === null
    ? model.unknown_age_premium
    : model.premium_max - (Math.min(age, model.age_days_cap) / model.age_days_cap) * model.premium_range;

  const tvl = Math.max(protocol.tvl_usd, 100_000);
  const sizeMult = Math.min(model.size_max,
    Math.max(model.size_min, model.size_base + Math.log10(tvl / 100_000) * model.size_weight));

  const catMult = multipleFor(protocol.category);
  const base = protocol.tvl_usd * catMult;
  const implied = Math.max(1, Math.round(base * growthMult * premium * sizeMult));

  const flags = [
    protocol.change_7d !== null && protocol.change_7d <= model.risk_drawdown_pct,
    age !== null && age < model.risk_young_days,
    protocol.tvl_usd < model.risk_small_usd,
  ].filter(Boolean).length;
  const risk: Risk = flags >= 2 ? 'high' : flags === 1 ? 'medium' : 'low';
  const confidence = Math.max(30, Math.min(95, 92 - flags * 18 - (age === null ? 8 : 0)));

  return { implied, age, growth, growthMult, premium, sizeMult, catMult, base, risk, confidence };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, m: impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.m.implied - a.m.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.m.age,
    implied_value_usd: s.m.implied,
    risk: s.m.risk,
    confidence: s.m.confidence,
    model: {
      category_multiple: s.m.catMult,
      base_usd: Math.round(s.m.base),
      growth_pct: round4(s.m.growth),
      growth_multiplier: round4(s.m.growthMult),
      premium_multiplier: round4(s.m.premium),
      size_multiplier: round4(s.m.sizeMult),
      age_days: s.m.age,
    },
    farm_steps: farmSteps(s.p, s.m.age, s.m.risk, s.m.implied).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and read the protocol's own page.`;
  return s;
}

function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return `${Math.round(n)}`;
}

function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

function isCheapChain(chain: string): boolean {
  return /Solana|Base|Arbitrum|Optimism|Polygon|BSC|Avalanche|Sui|Aptos|Hyperliquid|Blast|Linea|Scroll|Mantle/i.test(chain);
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open, so the deposit is visible to the protocol's own accounting.`;
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) {
    return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain}, in the pair the protocol's own page lists first.`;
  }
  if (c.includes('bridge')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds once inside the app.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the same wallet.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge you can close the same week.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} into ${name} on ${chain} and place one position in a market you already understand.`;
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares in the same wallet.`;
  }
  if (c.includes('rwa')) {
    return `Mint or buy $${capital} of the protocol's yield asset on ${chain} and hold it in the same wallet.`;
  }
  if (c.includes('stable')) {
    return `Mint $${capital} of the stable asset through ${name} on ${chain} against collateral you already hold.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy until it expires.`;
  }
  if (c.includes('oracle') || c.includes('service') || c.includes('social') || c.includes('privacy')) {
    return `Use ${name} on ${chain} for a real task first, then hold $${capital} of the asset it issues, if it issues one.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open through the qualifying window.`;
}

/**
 * A protocol's farm plan: five steps, each an action with a cost and a time. Every step is derived
 * from the protocol's own record — category, chain, TVL, age, risk — never from a name.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, risk: Risk = 'low', implied = 0): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const cheap = isCheapChain(chain);
  const gasLine = cheap ? 'about $1 of gas' : 'about $6 of gas';
  const action = actionFor(p, capital, chain);
  const checkLine = risk === 'high'
    ? `Read the protocol's own docs and points page first and treat this as a speculative position: its record shows a drawdown, a short history or a small TVL.`
    : `Read the protocol's own docs and points page first, and confirm it still records no token before you commit.`;

  const share = implied > 0 ? ` A $${capital} ticket is a 1-in-${compact(implied / capital)} slice of the board's $${compact(implied)} implied launch.` : '';

  return [
    {
      text: `Open a fresh wallet that holds only the funds you plan to farm ${p.name} with, and keep its seed phrase offline; never reuse a wallet that holds your main assets.`,
      cost: 'free to create, plus the first transfer fee',
      time: '10 minutes',
    },
    {
      text: checkLine,
      cost: 'free',
      time: '10 minutes',
    },
    {
      text: `${action}${share}`,
      cost: `$${capital} of capital and ${gasLine}`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action a week — a deposit, a borrow, a swap or a governance vote — and keep every receipt in the wallet.`,
      cost: cheap ? 'about $1 of gas a week' : 'about $4 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days, then claim only from the link the protocol publishes, and log the wallet, dates and transactions before you unwind.`,
      cost: `the $${capital} stays in the position; claiming is free, and never pay to claim`,
      time: `${hold} days, then 10 minutes to claim and log`,
    },
  ];
}

export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_to_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

export function radarRow(row: BoardRow, floor: number): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    risk: row.risk,
    confidence: row.confidence,
    base_usd: row.model.base_usd,
    growth_multiplier: row.model.growth_multiplier,
    premium_multiplier: row.model.premium_multiplier,
    size_multiplier: row.model.size_multiplier,
    below_floor: row.tvl_usd < floor,
    farm_steps: row.farm_steps,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const fetchedAt = /fetched (\d{4}-\d{2}-\d{2})/.exec(snapshot.source);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: `DefiLlama protocols, fetched ${fetchedAt?.[1] ?? snapshot.as_of}`,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    category_multiple: CATEGORY_MULTIPLE,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, snapshot.floor_usd)),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  for (let i = 0; i < board.length; i += 1) if (board[i]!.rank !== i + 1) return `rank ${i + 1} is ${board[i]!.rank}`;
  for (let i = 1; i < board.length; i += 1) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'every row shares one implied value';
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
