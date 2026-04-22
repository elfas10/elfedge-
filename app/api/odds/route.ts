import { NextResponse } from "next/server";

const ODDS_API_BASE = "https://api.the-odds-api.com/v4/sports";

function jsonWithCors(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    },
  });
}

export async function GET(req: Request) {
  try {
    const apiKey = process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY;

    if (!apiKey) {
      return jsonWithCors(
        {
          error: "Missing ODDS_API_KEY on server",
          apiKeyPresent: false,
          events: [],
          count: 0,
        },
        500
      );
    }

    const { searchParams } = new URL(req.url);

    const sport = searchParams.get("sport") || "baseball_mlb";
    const regions = searchParams.get("regions") || "us";
    const markets = searchParams.get("markets") || "h2h,spreads,totals";
    const bookmakers = searchParams.get("bookmakers") || "";
    const oddsFormat = searchParams.get("oddsFormat") || "american";
    const dateFormat = searchParams.get("dateFormat") || "iso";

    const url = new URL(`${ODDS_API_BASE}/${sport}/odds`);
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("regions", regions);
    url.searchParams.set("markets", markets);
    url.searchParams.set("oddsFormat", oddsFormat);
    url.searchParams.set("dateFormat", dateFormat);

    if (bookmakers) {
      url.searchParams.set("bookmakers", bookmakers);
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const remaining = res.headers.get("x-requests-remaining");
    const used = res.headers.get("x-requests-used");

    if (!res.ok) {
      const text = await res.text();
      return jsonWithCors(
        {
          error: `Odds API request failed: ${res.status}`,
          details: text,
          apiKeyPresent: true,
        },
        500
      );
    }

    const data = await res.json();
    const events = Array.isArray(data) ? data : [];

    return jsonWithCors({
      apiKeyPresent: true,
      sport,
      count: events.length,
      remainingRequests: remaining,
      usedRequests: used,
      events,
    });
  } catch (error) {
    return jsonWithCors(
      {
        error: "Failed to fetch sportsbook odds",
        details: error instanceof Error ? error.message : "Unknown error",
        apiKeyPresent: Boolean(process.env.ODDS_API_KEY || process.env.VITE_ODDS_API_KEY),
      },
      500
    );
  }
}
