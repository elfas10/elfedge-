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
        "User-Agent": "Mozilla/5.0",
      },
      cache: "no-store",
    });

    const text = await res.text();

    return NextResponse.json({
      status: res.status,
      preview: text.slice(0, 1000),
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
