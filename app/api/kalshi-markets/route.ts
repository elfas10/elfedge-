import { NextResponse } from "next/server";

const KALSHI_BASE =
  "https://api.elections.kalshi.com/trade-api/v2/markets";

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

    return NextResponse.json({
      markets: deduped,
      rawCount: allMarkets.length,
      dedupedCount: deduped.length,
      filteredCount: deduped.length,
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
