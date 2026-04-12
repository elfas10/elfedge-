"use client";

import React, { useEffect, useMemo, useState } from "react";

type ModePreset = "loose" | "balanced" | "strict";
type ModelMode = "manual" | "market_plus_4" | "contrarian_demo";

type BaseMarket = {
  ticker: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  closeTime?: string | null;
  yesAsk?: number | null;
  yesBid?: number | null;
  yesMid?: number | null;
  lastTrade?: number | null;
  volume?: number | null;
};

type ComputedMarket = BaseMarket & {
  trueProb: number;
  price: number;
  edge: number;
  roi: number;
  spread: number | null;
};

type TrackedBet = {
  id: string;
  ticker: string;
  title: string;
  price: number;
  trueProb: number;
  edge: number;
  roi: number;
  addedAt: string;
  result: "open" | "win" | "loss";
};

const MODE_PRESETS: Record<
  ModePreset,
  {
    minEdge: number;
    minVolume: number;
    maxPrice: number;
    maxSpread: number;
    topN: number;
    modelProb: number;
  }
> = {
  loose: {
    minEdge: 2,
    minVolume: 0,
    maxPrice: 90,
    maxSpread: 12,
    topN: 20,
    modelProb: 55,
  },
  balanced: {
    minEdge: 4,
    minVolume: 50,
    maxPrice: 70,
    maxSpread: 8,
    topN: 10,
    modelProb: 55,
  },
  strict: {
    minEdge: 6,
    minVolume: 200,
    maxPrice: 60,
    maxSpread: 5,
    topN: 5,
    modelProb: 55,
  },
};

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function formatPct(value: number, digits = 2) {
  return `${value.toFixed(digits)}%`;
}

function formatCurrencyCents(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}¢`;
}

function formatCloseTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function normalizeMarket(raw: any): BaseMarket {
  const yesAskDollars = toNullableNumber(
    raw?.yes_ask_dollars ??
      raw?.yesAsk ??
      raw?.yes_ask ??
      raw?.best_yes_ask ??
      raw?.ask ??
      raw?.best_ask
  );

  const yesBidDollars = toNullableNumber(
    raw?.yes_bid_dollars ??
      raw?.yesBid ??
      raw?.yes_bid ??
      raw?.best_yes_bid ??
      raw?.bid ??
      raw?.best_bid
  );

  const lastPriceDollars = toNullableNumber(
    raw?.last_price_dollars ??
      raw?.lastTrade ??
      raw?.last_trade ??
      raw?.last_price ??
      raw?.last_traded_price ??
      raw?.recent_trade_price
  );

  const yesAsk = yesAskDollars !== null ? yesAskDollars * 100 : null;
  const yesBid = yesBidDollars !== null ? yesBidDollars * 100 : null;
  const lastTrade = lastPriceDollars !== null ? lastPriceDollars * 100 : null;
  const yesMid =
    yesAsk !== null && yesBid !== null ? (yesAsk + yesBid) / 2 : null;

  return {
    ticker:
      raw?.ticker ??
      raw?.market_ticker ??
      raw?.event_ticker ??
      `unknown-${Math.random().toString(36).slice(2)}`,
    title: String(
      raw?.title ??
        raw?.market_title ??
        raw?.question ??
        raw?.yes_sub_title ??
        raw?.event_title ??
        "Untitled market"
    ),
    subtitle:
      raw?.subtitle ??
      raw?.yes_sub_title ??
      raw?.series_title ??
      raw?.category ??
      null,
    status: raw?.status ?? raw?.market_status ?? "active",
    closeTime:
      raw?.closeTime ??
      raw?.close_time ??
      raw?.expiration_time ??
      raw?.expected_expiration_time ??
      raw?.settlement_time ??
      null,
    yesAsk,
    yesBid,
    yesMid,
    lastTrade,
    volume: toNullableNumber(
      raw?.volume_24h_fp ??
        raw?.volume_fp ??
        raw?.volume ??
        raw?.volume_24h ??
        raw?.open_interest_fp ??
        raw?.liquidity_dollars ??
        0
    ),
  };
}

function toNullableNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function inferModelProb(
  market: BaseMarket,
  manualProb: number,
  mode: ModelMode
): number {
  const fallbackMarketProb = market.yesMid ?? market.lastTrade ?? market.yesAsk ?? market.yesBid ?? 50;

  if (mode === "manual") {
    return clamp(manualProb, 1, 99);
  }

  if (mode === "market_plus_4") {
    return clamp(fallbackMarketProb + 4, 1, 99);
  }

  // Contrarian demo: push slightly away from consensus for testing.
  if (fallbackMarketProb >= 50) {
    return clamp(fallbackMarketProb - 6, 1, 99);
  }

  return clamp(fallbackMarketProb + 6, 1, 99);
}

function calcExpectedValuePct(trueProbPct: number, priceCents: number): number {
  const p = clamp(trueProbPct, 0, 100) / 100;
  const cost = clamp(priceCents, 0, 100) / 100;

  if (cost <= 0) return 0;

  const ev = p * 1 - cost;
  return ev * 100;
}

function calcROI(trueProbPct: number, priceCents: number): number {
  const p = clamp(trueProbPct, 0, 100) / 100;
  const cost = clamp(priceCents, 0, 100) / 100;

  if (cost <= 0) return 0;

  const ev = p * 1 - cost;
  return (ev / cost) * 100;
}

function getSpread(market: BaseMarket): number | null {
  if (market.yesAsk === null || market.yesAsk === undefined) return null;
  if (market.yesBid === null || market.yesBid === undefined) return null;
  return Math.max(0, market.yesAsk - market.yesBid);
}

function isLikelyBundledMarket(m: ComputedMarket) {
  const title = m.title.toLowerCase();
  const subtitle = (m.subtitle ?? "").toLowerCase();
  const ticker = m.ticker.toLowerCase();
  const commaCount = (m.title.match(/,/g) || []).length;

  return (
    commaCount >= 4 ||
    title.includes("crosscategory") ||
    ticker.includes("crosscategory") ||
    title.includes("same game parlay") ||
    title.includes("parlay") ||
    subtitle.includes("crosscategory")
  );
}

function getQualityScore(m: ComputedMarket) {
  let score = 0;

  score += m.edge * 10;

  if (m.volume !== null && m.volume !== undefined) {
    score += Math.min(m.volume / 50, 20);
  }

  if (m.spread !== null) {
    score += Math.max(0, 10 - m.spread);
  }

  if (m.price > 0) {
    score += 5;
  }

  if (!isLikelyBundledMarket(m)) {
    score += 20;
  } else {
    score -= 40;
  }

  if (m.title.length < 120) {
    score += 4;
  }

  if ((m.title.match(/,/g) || []).length >= 4) {
    score -= 30;
  }

  return score;
}

function StatBlock({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid #e9d5ff",
        borderRadius: 16,
        padding: 14,
        background: "#fff",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#7c3aed",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: strong ? 900 : 700,
          color: strong ? "#6d28d9" : "#2e1065",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e9d5ff",
        borderRadius: 22,
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 16,
        fontWeight: 900,
        color: "#2e1065",
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

export default function KalshiEdgeFinderV2() {
  const [markets, setMarkets] = useState<BaseMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const [query, setQuery] = useState("");
  const [modelProb, setModelProb] = useState(MODE_PRESETS.loose.modelProb);
  const [minEdge, setMinEdge] = useState(MODE_PRESETS.loose.minEdge);
  const [minVolume, setMinVolume] = useState(MODE_PRESETS.loose.minVolume);
  const [maxPrice, setMaxPrice] = useState(MODE_PRESETS.loose.maxPrice);
  const [maxSpread, setMaxSpread] = useState(MODE_PRESETS.loose.maxSpread);
  const [topN, setTopN] = useState(MODE_PRESETS.loose.topN);

  const [modelMode, setModelMode] = useState<ModelMode>("manual");
  const [scannerMode, setScannerMode] = useState<ModePreset>("loose");
  const [trackedBets, setTrackedBets] = useState<TrackedBet[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("kalshi-edge-tracker-bets");
      if (raw) {
        setTrackedBets(JSON.parse(raw));
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("kalshi-edge-tracker-bets", JSON.stringify(trackedBets));
    } catch {}
  }, [trackedBets]);

  const loadMarkets = async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const res = await fetch("/api/kalshi-markets", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Feed request failed with status ${res.status}`);
      }

      const data = await res.json();

      const possibleArray =
        Array.isArray(data) ? data : Array.isArray(data?.markets) ? data.markets : Array.isArray(data?.data) ? data.data : [];
      console.log("sample market", possibleArray[0]);

      const normalized = possibleArray.map(normalizeMarket);
      setMarkets(normalized);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err: any) {
      setFetchError(err?.message ?? "Unknown feed error");
      setMarkets([]);
      setLastUpdated(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarkets();
  }, []);

  const applyPreset = (mode: ModePreset) => {
    setScannerMode(mode);
    setMinEdge(MODE_PRESETS[mode].minEdge);
    setMinVolume(MODE_PRESETS[mode].minVolume);
    setMaxPrice(MODE_PRESETS[mode].maxPrice);
    setMaxSpread(MODE_PRESETS[mode].maxSpread);
    setTopN(MODE_PRESETS[mode].topN);
    setModelProb(MODE_PRESETS[mode].modelProb);
  };

  const pricedMarkets = useMemo(() => {
    return markets
      .map((market) => {
        const price = market.yesAsk ?? market.yesMid ?? market.lastTrade ?? market.yesBid;
        if (price === null || price === undefined) return null;

        const trueProb = inferModelProb(market, Number(modelProb), modelMode);
        const edge = calcExpectedValuePct(trueProb, price);
        const roi = calcROI(trueProb, price);
        const spread = getSpread(market);

        return {
          ...market,
          trueProb,
          price,
          edge,
          roi,
          spread,
        };
      })
      .filter((m): m is ComputedMarket => m !== null);
  }, [markets, modelProb, modelMode]);

  const nonZeroPriceMarkets = useMemo(
    () => pricedMarkets.filter((m) => m.price !== null && m.price > 0),
    [pricedMarkets]
  );

  const quoteMarkets = useMemo(
    () =>
      nonZeroPriceMarkets.filter(
        (m) => m.yesAsk !== null || m.yesBid !== null || m.lastTrade !== null
      ),
    [nonZeroPriceMarkets]
  );

  const titleMarkets = useMemo(() => quoteMarkets, [quoteMarkets]);

  const spreadMarkets = useMemo(
    () => titleMarkets.filter((m) => m.spread === null || m.spread <= maxSpread),
    [titleMarkets, maxSpread]
  );

  const searchMarkets = useMemo(
    () =>
      spreadMarkets.filter((m) => {
        const text = `${m.title} ${m.subtitle ?? ""} ${m.ticker}`.toLowerCase();
        return text.includes(query.toLowerCase());
      }),
    [spreadMarkets, query]
  );

  const edgeMarkets = useMemo(
    () => searchMarkets.filter((m) => m.edge >= minEdge),
    [searchMarkets, minEdge]
  );

  const volumeMarkets = useMemo(
    () => edgeMarkets.filter((m) => m.volume === undefined || m.volume === null || m.volume >= minVolume),
    [edgeMarkets, minVolume]
  );

  const priceCapMarkets = useMemo(
    () => volumeMarkets.filter((m) => m.price !== null && m.price <= maxPrice),
    [volumeMarkets, maxPrice]
  );

  const cleanCandidateMarkets = useMemo(
  () =>
    priceCapMarkets.filter((m) => {
      const title = m.title.toLowerCase();
      const subtitle = (m.subtitle ?? "").toLowerCase();
      const ticker = m.ticker.toLowerCase();

      const commaCount = (m.title.match(/,/g) || []).length;

      const looksBundled =
        commaCount >= 3 ||
        ticker.includes("kxmve") ||
        ticker.includes("multigame") ||
        ticker.includes("crosscategory") ||
        title.includes("parlay") ||
        title.includes("crosscategory") ||
        title.includes("both teams") ||
        subtitle.includes("parlay") ||
        subtitle.includes("crosscategory");

      const hasRealPrice = m.price !== null && m.price > 0;
      const hasUsableAsk = typeof m.yesAsk === "number" && m.yesAsk > 0;
      const hasUsableBid = typeof m.yesBid === "number" && m.yesBid > 0;

      return !looksBundled && hasRealPrice && (hasUsableAsk || hasUsableBid);
    }),
  [priceCapMarkets]
);

const computedMarkets = useMemo(
  () =>
    [...cleanCandidateMarkets]
      .sort((a, b) => getQualityScore(b) - getQualityScore(a))
      .slice(0, topN),
  [cleanCandidateMarkets, topN]
);

const displayMarkets = computedMarkets;
  const title = m.title.toLowerCase();
  const subtitle = (m.subtitle ?? "").toLowerCase();
  const ticker = m.ticker.toLowerCase();

  const commaCount = (m.title.match(/,/g) || []).length;

  const looksBundled =
    commaCount >= 3 ||
    ticker.includes("kxmve") ||
    ticker.includes("multigame") ||
    ticker.includes("crosscategory") ||
    title.includes("parlay") ||
    title.includes("crosscategory") ||
    title.includes("both teams") ||
    subtitle.includes("parlay") ||
    subtitle.includes("crosscategory");

  const hasRealPrice = m.price !== null && m.price > 0;
  const hasUsableAsk = typeof m.yesAsk === "number" && m.yesAsk > 0;
  const hasUsableBid = typeof m.yesBid === "number" && m.yesBid > 0;

  return !looksBundled && hasRealPrice && (hasUsableAsk || hasUsableBid);
}),
[computedMarkets]
);

  const rawCount = markets.length;
  const pricedCount = pricedMarkets.length;
  const nonZeroPriceCount = nonZeroPriceMarkets.length;
  const quoteCount = quoteMarkets.length;
  const titleCount = titleMarkets.length;
  const spreadCount = spreadMarkets.length;
  const searchCount = searchMarkets.length;
  const edgeCount = edgeMarkets.length;
  const volumeCount = volumeMarkets.length;
  const finalCount = computedMarkets.length;
  const cleanCandidateCount = cleanCandidateMarkets.length;
  const displayCount = displayMarkets.length;

  const topPick = displayMarkets.length > 0 ? displayMarkets[0] : null;

  const stats = useMemo(() => {
    const source = displayMarkets.length > 0 ? displayMarkets : computedMarkets;

    const bestEdge = source.length > 0 ? Math.max(...source.map((m) => m.edge)) : 0;
    const avgEdge =
      source.length > 0
        ? source.reduce((sum, m) => sum + m.edge, 0) / source.length
        : 0;

    const closed = trackedBets.filter((b) => b.result !== "open");
    const wins = closed.filter((b) => b.result === "win").length;
    const losses = closed.filter((b) => b.result === "loss").length;
    const totalClosed = closed.length;

    const profit = closed.reduce((sum, bet) => {
      const cost = bet.price / 100;
      if (bet.result === "win") return sum + (1 - cost);
      if (bet.result === "loss") return sum - cost;
      return sum;
    }, 0);

    const totalStaked = closed.reduce((sum, bet) => sum + bet.price / 100, 0);
    const trackerRoi = totalStaked > 0 ? (profit / totalStaked) * 100 : 0;
    const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;

    return {
      bestEdge,
      avgEdge,
      matches: source.length,
      trackerRoi,
      wins,
      losses,
      totalBets: trackedBets.length,
      profit,
      winRate,
    };
  }, [displayMarkets, computedMarkets, trackedBets]);

  const addToTracker = (market: ComputedMarket) => {
    setTrackedBets((prev) => {
      if (prev.some((b) => b.ticker === market.ticker && b.result === "open")) {
        return prev;
      }

      return [
        {
          id: `${market.ticker}-${Date.now()}`,
          ticker: market.ticker,
          title: market.title,
          price: market.price,
          trueProb: market.trueProb,
          edge: market.edge,
          roi: market.roi,
          addedAt: new Date().toISOString(),
          result: "open",
        },
        ...prev,
      ];
    });
  };

  const setTrackedBetResult = (id: string, result: "win" | "loss" | "open") => {
    setTrackedBets((prev) =>
      prev.map((bet) => (bet.id === id ? { ...bet, result } : bet))
    );
  };

  const actionBtn = (bg: string): React.CSSProperties => ({
    padding: "10px 14px",
    borderRadius: 12,
    border: "none",
    background: bg,
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#faf5ff",
        color: "#2e1065",
        padding: "20px 16px 48px",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                display: "inline-block",
                fontSize: 12,
                fontWeight: 800,
                color: "#6d28d9",
                background: "#ede9fe",
                borderRadius: 999,
                padding: "6px 10px",
                marginBottom: 12,
              }}
            >
              elfedge • live sports scanner
            </div>
            <h1
              style={{
                fontSize: 58,
                lineHeight: 1.02,
                margin: 0,
                color: "#2e1065",
                fontWeight: 900,
              }}
            >
              Kalshi Edge Finder V2
            </h1>
            <p style={{ fontSize: 16, color: "#475569", marginTop: 10 }}>
              Live public Kalshi market feed with instant edge scoring, top pick
              ranking, and a built-in bet tracker.
            </p>
            <div style={{ color: "#7c3aed", fontSize: 14 }}>
              Last updated: {lastUpdated || "—"}
            </div>
            {fetchError ? (
              <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 14 }}>
                Feed issue: {fetchError}
              </div>
            ) : null}
          </div>

          <button onClick={loadMarkets} style={actionBtn(loading ? "#8b5cf6" : "#6d28d9")}>
            {loading ? "Refreshing..." : "Refresh live data"}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            marginBottom: 20,
          }}
        >
          <Card>
            <CardTitle>↗ Best Edge</CardTitle>
            <div style={{ fontSize: 32, fontWeight: 900 }}>{formatPct(stats.bestEdge, 2)}</div>
            <div style={{ color: "#64748b" }}>Highest expected edge on the board</div>
          </Card>

          <Card>
            <CardTitle>$ Avg Edge</CardTitle>
            <div style={{ fontSize: 32, fontWeight: 900 }}>{formatPct(stats.avgEdge, 2)}</div>
            <div style={{ color: "#64748b" }}>Average edge after your filters</div>
          </Card>

          <Card>
            <CardTitle>⎇ Matches</CardTitle>
            <div style={{ fontSize: 32, fontWeight: 900 }}>{stats.matches}</div>
            <div style={{ color: "#64748b" }}>Markets currently passing filters</div>
          </Card>

          <Card>
            <CardTitle>Tracker ROI</CardTitle>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#16a34a" }}>
              {formatPct(stats.trackerRoi, 1)}
            </div>
            <div style={{ color: "#64748b" }}>Closed bet performance</div>
          </Card>
        </div>

        {topPick ? (
          <Card style={{ marginBottom: 20 }}>
            <CardTitle>↗ Top Pick Right Now</CardTitle>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 18,
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 10 }}>
                  {topPick.title}
                </div>

                {topPick.subtitle ? (
                  <div style={{ color: "#64748b", fontSize: 16, marginBottom: 10 }}>
                    {topPick.subtitle}
                  </div>
                ) : null}

                <div style={{ color: "#7c3aed", marginBottom: 10 }}>
                  Closes: {formatCloseTime(topPick.closeTime)}
                </div>

                <div
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "#ede9fe",
                    color: "#6d28d9",
                    fontWeight: 800,
                    fontSize: 12,
                    marginBottom: 14,
                  }}
                >
                  {topPick.status ?? "active"}
                </div>

                <div style={{ color: "#475569", lineHeight: 1.6, marginBottom: 14 }}>
                  This is the highest-ranked clean individual market based on your
                  current scanner mode, filters, spread threshold, and quality score.
                </div>

                <button onClick={() => addToTracker(topPick)} style={actionBtn("#6d28d9")}>
                  Add to Tracker
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 260,
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                }}
              >
                <StatBlock label="YES Ask" value={formatCurrencyCents(topPick.yesAsk)} />
                <StatBlock label="YES Bid" value={formatCurrencyCents(topPick.yesBid)} />
                <StatBlock
                  label="24H Volume"
                  value={topPick.volume?.toLocaleString() ?? "—"}
                />
                <StatBlock label="Model Prob" value={formatPct(topPick.trueProb, 1)} />
                <StatBlock label="Edge" value={formatPct(topPick.edge, 2)} strong />
                <StatBlock label="ROI" value={formatPct(topPick.roi, 2)} />
              </div>
            </div>
          </Card>
        ) : null}

        <Card style={{ marginBottom: 20 }}>
          <CardTitle>Debug</CardTitle>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            }}
          >
            <StatBlock label="Raw" value={rawCount} />
            <StatBlock label="Priced" value={pricedCount} />
            <StatBlock label="Price > 0" value={nonZeroPriceCount} />
            <StatBlock label="Has quote" value={quoteCount} />
            <StatBlock label="Title pass" value={titleCount} />
            <StatBlock label="Spread pass" value={spreadCount} />
            <StatBlock label="Search pass" value={searchCount} />
            <StatBlock label="Edge pass" value={edgeCount} />
            <StatBlock label="Volume pass" value={volumeCount} />
            <StatBlock label="CLEAN CANDIDATES" value={cleanCandidateCount} />
            <StatBlock label="Final matches" value={finalCount} />
            <StatBlock label="Display picks" value={displayCount} />
          </div>
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <CardTitle>Filters + Model</CardTitle>

          <div
            style={{
              display: "grid",
              gap: 14,
              gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
              marginBottom: 16,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Search markets</div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or ticker"
                style={inputStyle}
              />
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Model probability %</div>
              <input
                type="number"
                value={modelProb}
                onChange={(e) => setModelProb(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Min edge %</div>
              <input
                type="number"
                value={minEdge}
                onChange={(e) => setMinEdge(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Min volume</div>
              <input
                type="number"
                value={minVolume}
                onChange={(e) => setMinVolume(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Max YES price (¢)</div>
              <input
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Max spread (¢)</div>
              <input
                type="number"
                value={maxSpread}
                onChange={(e) => setMaxSpread(Number(e.target.value))}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 18, maxWidth: 180 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Max results shown</div>
            <input
              type="number"
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 8, fontWeight: 800 }}>Model mode</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              onClick={() => setModelMode("manual")}
              style={pillBtn(modelMode === "manual")}
            >
              Manual probability
            </button>
            <button
              onClick={() => setModelMode("market_plus_4")}
              style={pillBtn(modelMode === "market_plus_4")}
            >
              Market + 4%
            </button>
            <button
              onClick={() => setModelMode("contrarian_demo")}
              style={pillBtn(modelMode === "contrarian_demo")}
            >
              Contrarian demo
            </button>
          </div>

          <div style={{ color: "#64748b", marginBottom: 18 }}>
            Manual probability is the most useful starting point. The built-in demo
            modes are placeholders until you plug in a real sports model.
          </div>

          <div style={{ marginBottom: 8, fontWeight: 800 }}>Scanner mode</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <button onClick={() => applyPreset("loose")} style={pillBtn(scannerMode === "loose")}>
              Loose
            </button>
            <button
              onClick={() => applyPreset("balanced")}
              style={pillBtn(scannerMode === "balanced")}
            >
              Balanced
            </button>
            <button onClick={() => applyPreset("strict")} style={pillBtn(scannerMode === "strict")}>
              Strict
            </button>
          </div>

          <div style={{ color: "#64748b" }}>
            Clicking a scanner mode now updates the visible filter fields too.
          </div>
        </Card>

        <Card style={{ marginBottom: 20 }}>
          <CardTitle>Top Kalshi edges</CardTitle>

          {displayMarkets.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
              No clean individual markets match your current filters.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {displayMarkets.map((market) => (
                <div
                  key={market.ticker}
                  style={{
                    border: "1px solid #e9d5ff",
                    borderRadius: 18,
                    padding: 18,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 900,
                          marginBottom: 10,
                          color: "#2e1065",
                        }}
                      >
                        {market.title}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          marginBottom: 10,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: "#6d28d9",
                            background: "#ede9fe",
                            borderRadius: 999,
                            padding: "5px 9px",
                          }}
                        >
                          {market.ticker}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: "#6d28d9",
                            background: "#f5f3ff",
                            borderRadius: 999,
                            padding: "5px 9px",
                          }}
                        >
                          {market.status ?? "active"}
                        </span>
                      </div>

                      {market.subtitle ? (
                        <div style={{ color: "#64748b", marginBottom: 8 }}>
                          {market.subtitle}
                        </div>
                      ) : null}

                      <div style={{ color: "#7c3aed", marginBottom: 14 }}>
                        Closes: {formatCloseTime(market.closeTime)}
                      </div>

                      <button onClick={() => addToTracker(market)} style={actionBtn("#6d28d9")}>
                        Add to Tracker
                      </button>
                    </div>

                    <div
                      style={{
                        flex: 1,
                        minWidth: 260,
                        display: "grid",
                        gap: 10,
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      }}
                    >
                      <StatBlock label="YES Ask" value={formatCurrencyCents(market.yesAsk)} />
                      <StatBlock label="YES Bid" value={formatCurrencyCents(market.yesBid)} />
                      <StatBlock
                        label="24H Volume"
                        value={market.volume?.toLocaleString() ?? "—"}
                      />
                      <StatBlock label="Model Prob" value={formatPct(market.trueProb, 1)} />
                      <StatBlock label="Edge" value={formatPct(market.edge, 2)} strong />
                      <StatBlock label="ROI" value={formatPct(market.roi, 2)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "1fr 1fr",
            marginBottom: 20,
          }}
        >
          <Card>
            <CardTitle>🧾 Performance</CardTitle>
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              }}
            >
              <StatBlock label="Win Rate" value={formatPct(stats.winRate, 1)} />
              <StatBlock label="Wins" value={stats.wins} />
              <StatBlock label="Losses" value={stats.losses} />
              <StatBlock label="ROI" value={formatPct(stats.trackerRoi, 1)} />
              <StatBlock
                label="Profit"
                value={`$${stats.profit.toFixed(2)}`}
                strong
              />
              <StatBlock label="Total Bets" value={stats.totalBets} />
            </div>
          </Card>

          <Card>
            <CardTitle>📊 Bet Tracker</CardTitle>
            {trackedBets.length === 0 ? (
              <div style={{ color: "#64748b" }}>No bets tracked yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {trackedBets.map((bet) => (
                  <div
                    key={bet.id}
                    style={{
                      border: "1px solid #e9d5ff",
                      borderRadius: 14,
                      padding: 12,
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>{bet.title}</div>
                    <div style={{ color: "#64748b", fontSize: 13, marginBottom: 8 }}>
                      {bet.ticker} • Entry {formatCurrencyCents(bet.price)} • Edge{" "}
                      {formatPct(bet.edge, 2)}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() => setTrackedBetResult(bet.id, "open")}
                        style={smallPillBtn(bet.result === "open")}
                      >
                        Open
                      </button>
                      <button
                        onClick={() => setTrackedBetResult(bet.id, "win")}
                        style={smallPillBtn(bet.result === "win", "#16a34a")}
                      >
                        Win
                      </button>
                      <button
                        onClick={() => setTrackedBetResult(bet.id, "loss")}
                        style={smallPillBtn(bet.result === "loss", "#dc2626")}
                      >
                        Loss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card>
          <CardTitle>How the edge is calculated</CardTitle>
          <div style={{ color: "#475569", lineHeight: 1.7 }}>
            Edge = model probability minus current YES price probability. ROI =
            expected value divided by entry price. This is still a lightweight
            scanner, so you should use it as a shortlist tool, not blind auto-bet
            logic.
          </div>
        </Card>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #d8b4fe",
  outline: "none",
  fontSize: 15,
  background: "#fff",
  color: "#2e1065",
};

function pillBtn(active: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 14,
    border: active ? "1px solid #6d28d9" : "1px solid #d8b4fe",
    background: active ? "#6d28d9" : "#fff",
    color: active ? "#fff" : "#2e1065",
    fontWeight: 800,
    cursor: "pointer",
  };
}

function smallPillBtn(active: boolean, activeBg = "#6d28d9"): React.CSSProperties {
  return {
    padding: "7px 10px",
    borderRadius: 10,
    border: active ? `1px solid ${activeBg}` : "1px solid #d8b4fe",
    background: active ? activeBg : "#fff",
    color: active ? "#fff" : "#2e1065",
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 12,
  };
}
