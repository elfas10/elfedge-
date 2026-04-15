import { NextResponse } from "next/server";

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2/markets";

// Expand this over time as you discover real Kalshi sports naming patterns.
const LEAGUE_PATTERNS: Array<{ league: string; patterns: RegExp[] }> = [
  { league: "NBA", patterns: [/\bNBA\b/i, /\bLakers\b/i, /\bCeltics\b/i, /\bWarriors\b/i, /\bNuggets\b/i, /\bKnicks\b/i] },
  { league: "NFL", patterns: [/\bNFL\b/i, /\bChiefs\b/i, /\bEagles\b/i, /\bCowboys\b/i, /\b49ers\b/i, /\bBills\b/i] },
  { league: "MLB", patterns: [/\bMLB\b/i, /\bYankees\b/i, /\bDodgers\b/i, /\bRed Sox\b/i, /\bCubs\b/i, /\bBraves\b/i] },
  { league: "NHL", patterns: [/\bNHL\b/i, /\bBruins\b/i, /\bRangers\b/i, /\bOilers\b/i, /\bPanthers\b/i] },
  { league: "NCAAB", patterns: [/\bNCAAB\b/i, /\bDuke\b/i, /\bUNC\b/i, /\bKansas\b/i, /\bKentucky\b/i] },
  { league: "NCAAF", patterns: [/\bNCAAF\b/i, /\bCollege Football\b/i] },
  { league: "Soccer", patterns: [/\bPremier League\b/i, /\bChampions League\b/i, /\bFC\b/i, /\bUnited\b/i, /\bCity\b/i] },
  { league: "Tennis", patterns: [/\bATP\b/i, /\bWTA\b/i, /\bOpen\b/i] },
  { league: "Golf", patterns: [/\bPGA\b/i, /\bMasters\b/i, /\bOpen Championship\b/i] },
];

function dedupeByTicker(markets: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];

  for (const market of markets) {
    const ticker = String(market?.ticker ?? "");
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(market);
  }

  return out;
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function detectLeague(text: string): string | null {
  for (const { league, patterns } of LEAGUE_PATTERNS) {
    if (patterns.some((re) => re.test(text))) return league;
  }
  return null;
}

function looksLikeSports(raw: any): boolean {
  const text = [
    raw?.title,
    raw?.subtitle,
    raw?.event_title,
    raw?.event_ticker,
    raw?.ticker,
    raw?.series_ticker,
  ]
    .filter(Boolean)
    .join(" ");

  return detectLeague(text) !== null;
}

function inferMarketType(text: string): string {
  if (/spread|cover/i.test(text)) return "Spread";
  if (/total|over|under/i.test(text)) return "Total";
  if (/prop|points|rebounds|assists|yards|hits|home runs/i.test(text)) return "Player Prop";
  if (/championship|title|win.*division|make.*playoffs/i.test(text)) return "Futures";
  return "Moneyline";
}

function normalizeMarket(raw: any) {
  const joinedText = [
    raw?.title,
    raw?.subtitle,
    raw?.event_title,
    raw?.event_ticker,
    raw?.ticker,
  ]
    .filter(Boolean)
    .join(" ");

  const league = detectLeague(joinedText);
  if (!league) return null;

  // Kalshi fields can vary. We defensively check several possibilities.
  const yesAskCents = toNumber(raw?.yes_ask ?? raw?.yesAsk ?? raw?.ask ?? raw?.best_yes_ask, NaN);
  const noAskCents = toNumber(raw?.no_ask ?? raw?.noAsk ?? raw?.best_no_ask, NaN);
  const yesBidCents = toNumber(raw?.yes_bid ?? raw?.yesBid ?? raw?.best_yes_bid, NaN);
  const noBidCents = toNumber(raw?.no_bid ?? raw?.noBid ?? raw?.best_no_bid, NaN);

  const yesPrice = Number.isFinite(yesAskCents)
    ? clamp01(yesAskCents / 100)
    : Number.isFinite(noAskCents)
    ? clamp01(1 - noAskCents / 100)
    : 0.5;

  const noPrice = Number.isFinite(noAskCents)
    ? clamp01(noAskCents / 100)
    : clamp01(1 - yesPrice);

  const spreadCandidates = [
    Number.isFinite(yesAskCents) && Number.isFinite(yesBidCents) ? (yesAskCents - yesBidCents) / 100 : NaN,
    Number.isFinite(noAskCents) && Number.isFinite(noBidCents) ? (noAskCents - noBidCents) / 100 : NaN,
  ].filter((v) => Number.isFinite(v));

  const spread = spreadCandidates.length > 0 ? Math.max(...spreadCandidates) : Math.abs(1 - (yesPrice + noPrice));

  const impliedProbability = Math.round(yesPrice * 100);

  // Placeholder fair probability model for now.
  // Replace this later with your real fair-odds logic or sportsbook comparison.
  const fairProbability = Math.max(
    1,
    Math.min(99, Math.round(impliedProbability + (spread < 0.05 ? 3 : spread < 0.08 ? 1 : -2)))
  );

  const evPercent = Number((((fairProbability / 100) - yesPrice) * 100).toFixed(1));

  const event =
    raw?.event_title ||
    raw?.subtitle ||
    raw?.event_ticker ||
    raw?.series_ticker ||
    raw?.title ||
    "Unknown Event";

  const title = raw?.title || "Unknown Market";

  return {
    id: String(raw?.ticker ?? raw?.id ?? `${event}-${title}`),
    ticker: String(raw?.ticker ?? ""),
    event,
    title,
    league,
    marketType: inferMarketType(`${title} ${event}`),
    side: "YES",
    yesPrice: Number(yesPrice.toFixed(2)),
    noPrice: Number(noPrice.toFixed(2)),
    volume: toNumber(raw?.volume ?? raw?.volume_dollars ?? raw?.open_interest, 0),
    spread: Number(spread.toFixed(3)),
    impliedProbability,
    fairProbability,
    evPercent,
    lastUpdated: raw?.last_updated_ts
      ? new Date(raw.last_updated_ts).toISOString()
      : raw?.close_time
      ? new Date(raw.close_time).toISOString()
      : new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const allMarkets: any[] = [];
    let cursor: string | null = null;
    const maxPages = 8;

    for (let page = 0; page < maxPages; page++) {
      const url = new URL(KALSHI_BASE);
      url.searchParams.set("status", "open");
      url.searchParams.set("limit", "200");
      url.searchParams.set("mve_filter", "exclude");
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          {
            error: `Kalshi request failed: ${res.status}`,
            details: text,
          },
          { status: 500 }
        );
      }

      const data = await res.json();
      const markets = Array.isArray(data?.markets) ? data.markets : [];
      allMarkets.push(...markets);

      if (!data?.cursor) {
        cursor = null;
        break;
      }

      cursor = data.cursor;
    }

    const deduped = dedupeByTicker(allMarkets);
    const sportsOnly = deduped.filter(looksLikeSports);
    const normalized = sportsOnly
      .map(normalizeMarket)
      .filter(Boolean)
      .sort((a: any, b: any) => b.evPercent - a.evPercent);

    return NextResponse.json({
      markets: normalized,
      counts: {
        raw: allMarkets.length,
        deduped: deduped.length,
        sportsOnly: sportsOnly.length,
        normalized: normalized.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch Kalshi sports markets",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
