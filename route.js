export async function GET() {
  try {
    let cursor = "";
    let pages = 0;
    const allMarkets = [];

    while (pages < 3) {
      const url = new URL(
        "https://api.elections.kalshi.com/trade-api/v2/markets"
      );
      url.searchParams.set("status", "open");
      url.searchParams.set("limit", "200");
      url.searchParams.set("mve_filter", "exclude");
      if (cursor) url.searchParams.set("cursor", cursor);

      const response = await fetch(url.toString(), {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Kalshi request failed: ${response.status}`);
      }

      const data = await response.json();
      allMarkets.push(...(data.markets || []));

      if (!data.cursor) break;
      cursor = data.cursor;
      pages += 1;
    }

    return Response.json({ markets: allMarkets });
  } catch (error) {
    return Response.json(
      { error: "Proxy failed", details: error.message },
      { status: 500 }
    );
  }
}
