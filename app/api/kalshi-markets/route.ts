import { NextResponse } from "next/server";

const KALSHI_BASE =
  "https://api.elections.kalshi.com/trade-api/v2/markets";

export async function GET() {
  try {
    const url = new URL(KALSHI_BASE);
    url.searchParams.set("status", "open");
    url.searchParams.set("limit", "200");

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

    return NextResponse.json({
      markets: data.markets ?? [],
      cursor: data.cursor ?? null,
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
