import { NextResponse } from "next/server";

const KALSHI_BASE =
  "https://api.elections.kalshi.com/trade-api/v2/markets";

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
      const markets = Array.isArray(data.markets) ? data.markets : [];

      allMarkets.push(...markets);

      if (!data.cursor) {
        cursor = null;
        break;
      }

      cursor = data.cursor;
    }

    return NextResponse.json({
      markets: allMarkets,
      count: allMarkets.length,
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
