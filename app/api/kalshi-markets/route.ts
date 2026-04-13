import { NextResponse } from "next/server";

const KALSHI_BASE =
  "https://api.elections.kalshi.com/trade-api/v2/markets";

function isOpenLike(m: any): boolean {
  const status = String(m?.status ?? "").toLowerCase();
  return status === "open" || status === "active";
}

function isBinary(m: any): boolean {
  return String(m?.market_type ?? "").toLowerCase() === "binary";
}

function isObviousBundle(m: any): boolean {
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

  const hasMveFields =
    Boolean(m?.mve_collection_ticker) ||
    (Array.isArray(m?.mve_selected_legs) && m.mve_selected_legs.length > 1) ||
    Boolean(m?.custom_strike?.["Associated Markets"]) ||
    Boolean(m?.custom_strike?.["Associated Events"]) ||
    Boolean(m?.custom_strike?.["Multivariate Event Ticker"]);

  return (
    hasMveFields ||
    ticker.includes("kxmve") ||
    eventTicker.includes("kxmve") ||
    ticker.includes("multigame") ||
    eventTicker.includes("multigame") ||
    combined.includes("crosscategory") ||
    combined.includes("same game parlay") ||
    combined.includes("parlay")
  );
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
      const markets = Array.isArray(data?.markets)
        ? data.markets
        : Array.isArray(data)
        ? data
        : [];

      allMarkets.push(...markets);

      if (!data?.cursor) {
        cursor = null;
        break;
      }

      cursor = data.cursor;
    }

    const deduped = dedupeByTicker(allMarkets);

    const filteredMarkets = deduped.filter(
      (m) => isOpenLike(m) && isBinary(m) && !isObviousBundle(m)
    );

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
