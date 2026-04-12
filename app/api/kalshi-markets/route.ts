import { NextResponse } from "next/server";

const KALSHI_BASE =
  "https://api.elections.kalshi.com/trade-api/v2/markets";

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dollarsToCents(value: unknown): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  return n * 100;
}

function getYesAskCents(m: any): number | null {
  return (
    dollarsToCents(m?.yes_ask_dollars) ??
    toNumber(m?.yesAsk) ??
    toNumber(m?.yes_ask) ??
    toNumber(m?.best_yes_ask) ??
    toNumber(m?.ask) ??
    toNumber(m?.best_ask)
  );
}

function getYesBidCents(m: any): number | null {
  return (
    dollarsToCents(m?.yes_bid_dollars) ??
    toNumber(m?.yesBid) ??
    toNumber(m?.yes_bid) ??
    toNumber(m?.best_yes_bid) ??
    toNumber(m?.bid) ??
    toNumber(m?.best_bid)
  );
}

function getLastTradeCents(m: any): number | null {
  return (
    dollarsToCents(m?.last_price_dollars) ??
    toNumber(m?.lastTrade) ??
    toNumber(m?.last_trade) ??
    toNumber(m?.last_price) ??
    toNumber(m?.last_traded_price) ??
    toNumber(m?.recent_trade_price)
  );
}

function isOpenLike(m: any): boolean {
  const status = String(m?.status ?? "").toLowerCase();
  return status === "open" || status === "active";
}

function isBinary(m: any): boolean {
  return String(m?.market_type ?? "").toLowerCase() === "binary";
}

function isBundledOrMultiLeg(m: any): boolean {
  const ticker = String(m?.ticker ?? "").toLowerCase();
  const eventTicker = String(m?.event_ticker ?? "").toLowerCase();
  const title = String(m?.title ?? "").toLowerCase();
  const yesSubtitle = String(m?.yes_sub_title ?? "").toLowerCase();
  const noSubtitle = String(m?.no_sub_title ?? "").toLowerCase();
  const mveCollectionTicker = String(m?.mve_collection_ticker ?? "").toLowerCase();

  const combined = [
    ticker,
    eventTicker,
    title,
    yesSubtitle,
    noSubtitle,
    mveCollectionTicker,
  ].join(" ");

  const commaCount = (title.match(/,/g) || []).length;

  const hasMultiLegFields =
    Boolean(m?.mve_collection_ticker) ||
    (Array.isArray(m?.mve_selected_legs) && m.mve_selected_legs.length > 1) ||
    Boolean(m?.custom_strike?.["Associated Markets"]) ||
    Boolean(m?.custom_strike?.["Associated Events"]);

  return (
    hasMultiLegFields ||
    ticker.includes("kxmve") ||
    eventTicker.includes("kxmve") ||
    ticker.includes("multigame") ||
    eventTicker.includes("multigame") ||
    ticker.includes("crosscategory") ||
    eventTicker.includes("crosscategory") ||
    combined.includes("crosscategory") ||
    combined.includes("parlay") ||
    combined.includes("same game parlay") ||
    commaCount >= 3
  );
}

function hasUsableYesSidePricing(m: any): boolean {
  const yesAsk = getYesAskCents(m);
  const yesBid = getYesBidCents(m);
  const lastTrade = getLastTradeCents(m);

  const usable = [yesAsk, yesBid, lastTrade].some(
    (v) => typeof v === "number" && v > 0 && v < 100
  );

  return usable;
}

function dedupeByTicker(markets: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];

  for (const market of markets) {
    const ticker = String(market?.ticker ?? "");
    if (!ticker) continue;
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(market);
  }

  return out;
}

function isCleanSingleMarket(m: any): boolean {
  return (
    isOpenLike(m) &&
    isBinary(m) &&
    !isBundledOrMultiLeg(m) &&
    hasUsableYesSidePricing(m)
  );
}

export async function GET() {
  try {
    const allMarkets: any[] = [];
    let cursor: string | null = null;
    const maxPages = 5;

    for (let page = 0; page < maxPages; page++) {
      const url = new URL(KALSHI_BASE);
      url.searchParams.set("status", "open");
      url.searchParams.set("limit", "200");
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { error: `Kalshi request failed: ${res.status}`, details: text },
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
    const filteredMarkets = deduped.filter(isCleanSingleMarket);

    return NextResponse.json({
      markets: filteredMarkets,
      rawCount: allMarkets.length,
      dedupedCount: deduped.length,
      filteredCount: filteredMarkets.length,
      cursor,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch Kalshi markets",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
