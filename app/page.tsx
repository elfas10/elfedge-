"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  TrendingUp,
  DollarSign,
  Filter,
  AlertCircle,
} from "lucide-react";

const MODE_PRESETS = {
  loose: {
    minEdge: 2,
    minVolume: 100,
    maxPrice: 90,
    maxSpread: 12,
    topN: 20,
    modelProb: 55,
  },
  balanced: {
    minEdge: 4,
    minVolume: 500,
    maxPrice: 70,
    maxSpread: 8,
    topN: 10,
    modelProb: 55,
  },
  strict: {
    minEdge: 6,
    minVolume: 2000,
    maxPrice: 60,
    maxSpread: 5,
    topN: 5,
    modelProb: 55,
  },
};

type ModeKey = keyof typeof MODE_PRESETS;
type ModelMode = "manual" | "marketPlus" | "contrarian";

type Market = {
  ticker: string;
  title: string;
  subtitle: string;
  status: string;
  closeTime: string | null;
  openTime: string | null;
  volume: number;
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  yesMid: number | null;
  lastTrade: number | null;
  raw?: any;
  trueProb?: number | null;
  price?: number | null;
  edge?: number | null;
  roi?: number | null;
  spread?: number | null;
};

type TrackedBet = {
  id: string;
  title: string;
  subtitle: string;
  ticker: string;
  side: "YES";
  entryPrice: number | null;
  stake: number;
  modelProb: number | null;
  edge: number | null;
  roi: number | null;
  spread: number | null;
  volume: number | null;
  mode: ModeKey;
  status: "open" | "closed";
  result: "win" | "loss" | null;
  pnl: number;
  createdAt: string;
  closeTime: string | null;
};

type ComputedMarket = Market & {
  trueProb: number;
  price: number;
  edge: number;
  roi: number | null;
  spread: number | null;
};

function isSportsMarket(market: Market) {
  const text = `${market.title || ""} ${market.subtitle || ""} ${
    market.ticker || ""
  }`.toLowerCase();

  const sportsKeywords = [
    "nba",
    "nfl",
    "mlb",
    "nhl",
    "soccer",
    "football",
    "basketball",
    "baseball",
    "hockey",
    "tennis",
    "golf",
    "ufc",
    "mma",
    "ncaa",
    "march madness",
    "points",
    "rebounds",
    "assists",
    "yards",
    "touchdown",
    "goals",
    "hits",
    "strikeouts",
    "wins",
    "spread",
    "tds",
    "player",
    "team",
    "match",
    "game",
  ];

  return sportsKeywords.some((keyword) => text.includes(keyword));
}

function getSpread(market: Market) {
  if (market.yesBid == null || market.yesAsk == null) return null;
  return market.yesAsk - market.yesBid;
}

function getQualityScore(m: ComputedMarket) {
  const edgeScore = m.edge;
  const volumeScore = Math.log10(m.volume + 1);
  const spreadPenalty = m.spread != null ? m.spread * 10 : 0;
  return edgeScore * 2 + volumeScore * 5 - spreadPenalty;
}

const Card = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={className}
    style={{
      border: "1px solid #e9d5ff",
      borderRadius: 20,
      background: "rgba(255,255,255,0.94)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      boxShadow: "0 10px 30px rgba(88, 28, 135, 0.08)",
      overflow: "hidden",
    }}
  >
    {children}
  </div>
);

const CardHeader = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: "18px 20px 0 20px" }}>{children}</div>
);

const CardTitle = ({ children }: { children: React.ReactNode }) => (
  <h2
    style={{
      fontSize: 18,
      fontWeight: 800,
      margin: 0,
      color: "#2e1065",
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}
  >
    {children}
  </h2>
);

const CardContent = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: "18px 20px 20px 20px" }}>{children}</div>
);

const Button = ({
  children,
  onClick,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "outline";
}) => (
  <button
    onClick={onClick}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "11px 16px",
      borderRadius: 14,
      border:
        variant === "outline" ? "1px solid #d8b4fe" : "1px solid transparent",
      background:
        variant === "outline"
          ? "#ffffff"
          : "linear-gradient(135deg, #6d28d9 0%, #4c1d95 100%)",
      color: variant === "outline" ? "#4c1d95" : "#ffffff",
      cursor: "pointer",
      fontWeight: 700,
      boxShadow:
        variant === "outline" ? "none" : "0 8px 20px rgba(109, 40, 217, 0.22)",
    }}
  >
    {children}
  </button>
);

const Input = (
  props: React.InputHTMLAttributes<HTMLInputElement>
) => (
  <input
    {...props}
    style={{
      width: "100%",
      padding: "12px 14px",
      borderRadius: 12,
      border: "1px solid #d8b4fe",
      fontSize: 14,
      background: "#fff",
      color: "#2e1065",
      outline: "none",
    }}
  />
);

const Badge = ({
  children,
  variant = "secondary",
}: {
  children: React.ReactNode;
  variant?: "secondary" | "outline";
}) => (
  <span
    style={{
      display: "inline-block",
      padding: "5px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 700,
      border: variant === "outline" ? "1px solid #d8b4fe" : "none",
      background: variant === "outline" ? "#fff" : "#f3e8ff",
      color: "#6b21a8",
    }}
  >
    {children}
  </span>
);

const DEFAULT_MODEL_PROB = 55;

function clamp(num: number, min: number, max: number) {
  return Math.min(Math.max(num, min), max);
}

function toPercentFromDollarString(value: string | number | null | undefined) {
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return n * 100;
}

function formatPct(value: number | null | undefined, digits: number = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

function formatCurrencyCents(pricePct: number | null | undefined) {
  if (pricePct === null || pricePct === undefined || Number.isNaN(pricePct)) {
    return "—";
  }
  return `${Math.round(pricePct)}¢`;
}

function calcExpectedValuePct(trueProbPct: number, yesPricePct: number) {
  return trueProbPct - yesPricePct;
}

function calcROI(
  trueProbPct: number,
  yesPricePct: number | null | undefined
): number | null {
  if (!yesPricePct) return null;
  return ((trueProbPct - yesPricePct) / yesPricePct) * 100;
}

function inferModelProb(
  market: Market,
  sliderProb: number,
  mode: ModelMode
): number {
  const yesMid = market.yesMid ?? market.lastTrade ?? 50;
  if (mode === "manual") return sliderProb;
  if (mode === "marketPlus") return clamp(yesMid + 4, 1, 99);
  if (mode === "contrarian") return clamp(100 - yesMid, 1, 99);
  return sliderProb;
}

async function fetchAllOpenMarkets(): Promise<any[]> {
  const res = await fetch("/api/kalshi-markets");
  if (!res.ok) throw new Error(`Proxy failed (${res.status})`);
  const data = await res.json();
  return data.markets || [];
}

function normalizeMarket(m: any): Market {
  const yesBid = toPercentFromDollarString(m.yes_bid_dollars);
  const yesAsk = toPercentFromDollarString(m.yes_ask_dollars);
  const noBid = toPercentFromDollarString(m.no_bid_dollars);
  const noAsk = toPercentFromDollarString(m.no_ask_dollars);
  const lastTrade = toPercentFromDollarString(m.last_price_dollars);

  let yesMid: number | null = null;
  if (yesBid !== null && yesAsk !== null) yesMid = (yesBid + yesAsk) / 2;
  else if (lastTrade !== null) yesMid = lastTrade;
  else if (yesBid !== null) yesMid = yesBid;
  else if (yesAsk !== null) yesMid = yesAsk;

  return {
    ticker: m.ticker,
    title: m.title || m.subtitle || m.ticker,
    subtitle: m.yes_sub_title || m.no_sub_title || "",
    status: m.status,
    closeTime: m.close_time ?? null,
    openTime: m.open_time ?? null,
    volume: Number(m.volume_24h_fp || m.volume_fp || 0),
    yesBid,
    yesAsk,
    noBid,
    noAsk,
    yesMid,
    lastTrade,
    raw: m,
  };
}

export default function KalshiEdgeFinderV2() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [trackedBets, setTrackedBets] = useState<TrackedBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ModeKey>("balanced");

  const [minEdge, setMinEdge] = useState<number>(
    MODE_PRESETS.balanced.minEdge
  );
  const [minVolume, setMinVolume] = useState<number>(
    MODE_PRESETS.balanced.minVolume
  );
  const [maxPrice, setMaxPrice] = useState<number>(
    MODE_PRESETS.balanced.maxPrice
  );
  const [maxSpread, setMaxSpread] = useState<number>(
    MODE_PRESETS.balanced.maxSpread
  );
  const [topN, setTopN] = useState<number>(MODE_PRESETS.balanced.topN);

  const [modelProb, setModelProb] = useState<number>(DEFAULT_MODEL_PROB);
  const [modelMode, setModelMode] = useState<ModelMode>("manual");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("kalshiTrackedBets");
    if (saved) {
      try {
        setTrackedBets(JSON.parse(saved) as TrackedBet[]);
      } catch (err) {
        console.error("Failed to parse tracked bets:", err);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("kalshiTrackedBets", JSON.stringify(trackedBets));
  }, [trackedBets]);

  function applyPreset(nextMode: ModeKey) {
    const preset = MODE_PRESETS[nextMode];
    setMode(nextMode);
    setMinEdge(preset.minEdge);
    setMinVolume(preset.minVolume);
    setMaxPrice(preset.maxPrice);
    setMaxSpread(preset.maxSpread);
    setTopN(preset.topN);
    setModelProb(preset.modelProb);
  }

  function addBetToTracker(market: ComputedMarket) {
    const newBet: TrackedBet = {
      id: `${market.ticker}-${Date.now()}`,
      title: market.title,
      subtitle: market.subtitle || "",
      ticker: market.ticker,
      side: "YES",
      entryPrice: market.yesAsk ?? market.price ?? null,
      stake: 10,
      modelProb: market.trueProb ?? null,
      edge: market.edge ?? null,
      roi: market.roi ?? null,
      spread: market.spread ?? null,
      volume: market.volume ?? null,
      mode,
      status: "open",
      result: null,
      pnl: 0,
      createdAt: new Date().toISOString(),
      closeTime: market.closeTime || null,
    };

    setTrackedBets((prev) => {
      const alreadyExists = prev.some(
        (bet) => bet.ticker === newBet.ticker && bet.status === "open"
      );
      if (alreadyExists) return prev;
      return [newBet, ...prev];
    });
  }

  function settleBet(id: string, result: "win" | "loss") {
    setTrackedBets((prev) =>
      prev.map((bet) => {
        if (bet.id !== id) return bet;
        const win = result === "win";
        const payout = win ? 1 : 0;
        const pnl = bet.stake * (payout - (bet.entryPrice ?? 0) / 100);

        return {
          ...bet,
          status: "closed",
          result,
          pnl,
        };
      })
    );
  }

  function removeBet(id: string) {
    setTrackedBets((prev) => prev.filter((bet) => bet.id !== id));
  }

  const demoMarkets: Market[] = [
    {
      ticker: "NBA-LEBRON-PTS",
      title: "Will LeBron score over 27.5 points?",
      subtitle: "YES contract",
      status: "open",
      closeTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      openTime: new Date().toISOString(),
      volume: 12500,
      yesBid: 49,
      yesAsk: 51,
      noBid: 48,
      noAsk: 50,
      yesMid: 50,
      lastTrade: 50,
    },
    {
      ticker: "NCAAB-DUKE-WIN",
      title: "Will Duke win tonight?",
      subtitle: "YES contract",
      status: "open",
      closeTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      openTime: new Date().toISOString(),
      volume: 8400,
      yesBid: 56,
      yesAsk: 58,
      noBid: 41,
      noAsk: 43,
      yesMid: 57,
      lastTrade: 57,
    },
    {
      ticker: "NFL-MAHOMES-TD",
      title: "Will Mahomes throw 3+ TDs?",
      subtitle: "YES contract",
      status: "open",
      closeTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      openTime: new Date().toISOString(),
      volume: 9900,
      yesBid: 43,
      yesAsk: 45,
      noBid: 54,
      noAsk: 56,
      yesMid: 44,
      lastTrade: 44,
    },
    {
      ticker: "MLB-YANKEES-WIN",
      title: "Will the Yankees win tonight?",
      subtitle: "YES contract",
      status: "open",
      closeTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      openTime: new Date().toISOString(),
      volume: 7100,
      yesBid: 61,
      yesAsk: 63,
      noBid: 36,
      noAsk: 38,
      yesMid: 62,
      lastTrade: 62,
    },
  ];

  const loadMarkets = async () => {
    try {
      setLoading(true);
      setError("");
      const raw = await fetchAllOpenMarkets();
      const normalized = raw.map(normalizeMarket);
      setMarkets(normalized);
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setError("Live Kalshi feed failed, so demo data is being used.");
      setMarkets(demoMarkets);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarkets();
  }, []);

  useEffect(() => {
    const interval = setInterval(loadMarkets, 15000);
    return () => clearInterval(interval);
  }, []);

  const pricedMarkets = markets
  .map((market) => {
    const price = market.yesAsk ?? market.yesMid ?? market.lastTrade;
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

const nonZeroPriceMarkets = pricedMarkets.filter(
  (m) => m.price !== null && m.price > 0
);

const quoteMarkets = nonZeroPriceMarkets.filter(
  (m) => m.yesAsk !== null || m.yesBid !== null || m.lastTrade !== null
);

const titleMarkets = quoteMarkets.filter(
  (m) =>
    !m.title.toLowerCase().includes(",") &&
    !m.title.toLowerCase().includes(" and ") &&
    m.title.length < 120
);
const spreadMarkets = titleMarkets.filter(
  (m) => m.spread === null || m.spread <= maxSpread
);

const searchMarkets = spreadMarkets.filter((m) => {
  const text = `${m.title} ${m.subtitle} ${m.ticker}`.toLowerCase();
  return text.includes(query.toLowerCase());
});

const edgeMarkets = searchMarkets.filter((m) => m.edge >= minEdge);

const volumeMarkets = edgeMarkets.filter(
  (m) => m.volume === undefined || m.volume >= minVolume
);

const priceCapMarkets = volumeMarkets.filter(
  (m) => m.price !== null && m.price <= maxPrice
);

const computedMarkets = [...priceCapMarkets]
  .sort((a, b) => getQualityScore(b) - getQualityScore(a))
  .slice(0, topN);
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


  const topPick = computedMarkets[0] || null;

  const stats = useMemo(() => {
    const total = computedMarkets.length;
    const avgEdge = total
      ? computedMarkets.reduce((sum, m) => sum + m.edge, 0) / total
      : 0;
    const best = total ? computedMarkets[0].edge : 0;
    return { total, avgEdge, best };
  }, [computedMarkets]);

  const closedBets = trackedBets.filter((b) => b.status === "closed");
  const wins = closedBets.filter((b) => b.result === "win").length;
  const losses = closedBets.filter((b) => b.result === "loss").length;
  const totalPnL = closedBets.reduce((sum, b) => sum + (b.pnl || 0), 0);
  const totalStaked = closedBets.reduce((sum, b) => sum + (b.stake || 0), 0);
  const roi = totalStaked > 0 ? (totalPnL / totalStaked) * 100 : 0;
  const winRate = closedBets.length > 0 ? (wins / closedBets.length) * 100 : 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        background:
          "radial-gradient(circle at top, #f5f3ff 0%, #faf5ff 35%, #f8fafc 100%)",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-block",
                padding: "6px 10px",
                borderRadius: 999,
                background: "#ede9fe",
                color: "#6d28d9",
                fontWeight: 800,
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              elfedge • live sports scanner
            </div>

            <h1
              style={{
                fontSize: 44,
                lineHeight: 1.05,
                margin: 0,
                color: "#2e1065",
              }}
            >
              Kalshi Edge Finder V2
            </h1>

            <p
              style={{
                marginTop: 12,
                maxWidth: 760,
                color: "#6b7280",
                fontSize: 16,
              }}
            >
              Live public Kalshi market feed with instant edge scoring, top pick
              ranking, and a built-in bet tracker.
            </p>

            <p style={{ marginTop: 8, color: "#7c3aed", fontSize: 14 }}>
              Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}
            </p>
          </div>

          <Button onClick={loadMarkets}>
            <RefreshCw size={16} />
            Refresh live data
          </Button>
        </div>

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle>
                <TrendingUp size={18} />
                Best Edge
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Metric value={formatPct(stats.best, 2)} />
              <Subtle>Highest expected edge on the board</Subtle>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <DollarSign size={18} />
                Avg Edge
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Metric value={formatPct(stats.avgEdge, 2)} />
              <Subtle>Average edge after your filters</Subtle>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <Filter size={18} />
                Matches
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Metric value={String(stats.total)} />
              <Subtle>Markets currently passing filters</Subtle>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tracker ROI</CardTitle>
            </CardHeader>
            <CardContent>
              <Metric
                value={`${roi.toFixed(1)}%`}
                color={roi >= 0 ? "#16a34a" : "#dc2626"}
              />
              <Subtle>Closed bet performance</Subtle>
            </CardContent>
          </Card>
        </div>

        {topPick && (
          <Card>
            <CardHeader>
              <CardTitle>
                <TrendingUp size={18} />
                Top Pick Right Now
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                style={{
                  display: "grid",
                  gap: 20,
                  gridTemplateColumns: "1.3fr 1fr",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 900,
                      color: "#2e1065",
                      marginBottom: 8,
                    }}
                  >
                    {topPick.title}
                  </div>

                  <div style={{ color: "#6b7280", marginBottom: 10 }}>
                    {topPick.subtitle || topPick.ticker}
                  </div>

                  <div style={{ fontSize: 13, color: "#7c3aed", marginBottom: 16 }}>
                    Closes:{" "}
                    {topPick.closeTime
                      ? new Date(topPick.closeTime).toLocaleString()
                      : "—"}
                  </div>

                  <div
                    style={{
                      display: "inline-block",
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: "#ede9fe",
                      color: "#6d28d9",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {topPick.status || "active"}
                  </div>

                  <p style={{ marginTop: 16, color: "#475569", lineHeight: 1.6 }}>
                    This is the highest-ranked market based on your scanner mode,
                    filters, spread threshold, and quality score.
                  </p>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  }}
                >
                  <StatBlock label="YES Ask" value={formatCurrencyCents(topPick.yesAsk)} />
                  <StatBlock label="YES Bid" value={formatCurrencyCents(topPick.yesBid)} />
                  <StatBlock label="24H Volume" value={topPick.volume.toLocaleString()} />
                  <StatBlock label="Model Prob" value={formatPct(topPick.trueProb, 1)} />
                  <StatBlock label="Edge" value={formatPct(topPick.edge, 2)} strong />
                  <StatBlock label="ROI" value={formatPct(topPick.roi, 2)} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
<Card>
  <CardHeader>
    <CardTitle>Debug</CardTitle>
  </CardHeader>
  <CardContent>
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      }}
    >
      <StatBlock label="Raw" value={rawCount} />
<StatBlock label="Priced" value={pricedCount} />
<StatBlock label="Price > 0" value={nonZeroPriceCount} />
<StatBlock label="Has quote" value={quoteCount} />
<StatBlock label="No comma title" value={titleCount} />
<StatBlock label="Spread pass" value={spreadCount} />
<StatBlock label="Search pass" value={searchCount} />
<StatBlock label="Edge pass" value={edgeCount} />
<StatBlock label="Volume pass" value={volumeCount} />
<StatBlock label="Final matches" value={finalCount} />
    </div>
  </CardContent>
</Card>
        <Card>
          <CardHeader>
            <CardTitle>Filters + Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              style={{
                display: "grid",
                gap: 16,
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              <Field label="Search markets">
                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 12, top: 12, color: "#a78bfa" }}>
                    <Search size={16} />
                  </div>
                  <input
                    placeholder="Search by title or ticker"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 14px 12px 38px",
                      borderRadius: 12,
                      border: "1px solid #d8b4fe",
                      fontSize: 14,
                    }}
                  />
                </div>
              </Field>

              <Field label="Model probability %">
                <Input
                  type="number"
                  value={modelProb}
                  onChange={(e) => setModelProb(Number(e.target.value))}
                />
              </Field>

              <Field label="Min edge %">
                <Input
                  type="number"
                  value={minEdge}
                  onChange={(e) => setMinEdge(Number(e.target.value))}
                />
              </Field>

              <Field label="Min volume">
                <Input
                  type="number"
                  value={minVolume}
                  onChange={(e) => setMinVolume(Number(e.target.value))}
                />
              </Field>

              <Field label="Max YES price (¢)">
                <Input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(Number(e.target.value))}
                />
              </Field>

              <Field label="Max spread (¢)">
                <Input
                  type="number"
                  value={maxSpread}
                  onChange={(e) => setMaxSpread(Number(e.target.value))}
                />
              </Field>

              <Field label="Max results shown">
                <Input
                  type="number"
                  value={topN}
                  onChange={(e) => setTopN(Number(e.target.value))}
                />
              </Field>
            </div>

            <div style={{ marginTop: 20 }}>
              <Field label="Model mode">
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[
                    { key: "manual", label: "Manual probability" },
                    { key: "marketPlus", label: "Market + 4%" },
                    { key: "contrarian", label: "Contrarian demo" },
                  ].map((option) => (
                    <Button
                      key={option.key}
                      variant={modelMode === option.key ? "default" : "outline"}
                      onClick={() => setModelMode(option.key as ModelMode)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <Subtle style={{ marginTop: 10 }}>
                  Manual probability is the most useful starting point. The built-in
                  demo modes are placeholders until you plug in a real sports model.
                </Subtle>
              </Field>
            </div>

            <div style={{ marginTop: 20 }}>
              <Field label="Scanner mode">
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {(["loose", "balanced", "strict"] as ModeKey[]).map((m) => (
                    <Button
                      key={m}
                      variant={mode === m ? "default" : "outline"}
                      onClick={() => applyPreset(m)}
                    >
                      {m[0].toUpperCase() + m.slice(1)}
                    </Button>
                  ))}
                </div>
                <Subtle style={{ marginTop: 10 }}>
                  Clicking a scanner mode now updates the visible filter fields too.
                </Subtle>
              </Field>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card>
            <CardContent>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <AlertCircle size={20} color="#b45309" style={{ marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 800, color: "#92400e", marginBottom: 4 }}>
                    Live feed issue
                  </div>
                  <div style={{ color: "#78350f" }}>{error}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Top Kalshi edges</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
                Loading live markets...
              </div>
            ) : computedMarkets.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b" }}>
                No markets match your current filters.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {computedMarkets.map((market) => (
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
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 8,
                            marginBottom: 8,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 20,
                              fontWeight: 900,
                              color: "#2e1065",
                            }}
                          >
                            {market.title}
                          </div>
                          <Badge>{market.ticker}</Badge>
                          <Badge variant="outline">{market.status}</Badge>
                        </div>

                        {market.subtitle ? (
                          <div style={{ color: "#6b7280", marginBottom: 8 }}>
                            {market.subtitle}
                          </div>
                        ) : null}

                        <div style={{ fontSize: 13, color: "#7c3aed" }}>
                          Closes:{" "}
                          {market.closeTime
                            ? new Date(market.closeTime).toLocaleString()
                            : "—"}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: 10,
                          gridTemplateColumns: "repeat(3, minmax(110px, 1fr))",
                          minWidth: 350,
                        }}
                      >
                        <StatBlock label="YES ask" value={formatCurrencyCents(market.price)} />
                        <StatBlock label="YES bid" value={formatCurrencyCents(market.yesBid)} />
                        <StatBlock label="24h volume" value={market.volume.toLocaleString()} />
                        <StatBlock label="Model prob" value={formatPct(market.trueProb, 1)} />
                        <StatBlock label="Edge" value={formatPct(market.edge, 2)} strong />
                        <StatBlock label="ROI" value={formatPct(market.roi, 2)} />
                      </div>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <Button onClick={() => addBetToTracker(market)} variant="outline">
                        Add to Tracker
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle>📈 Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                style={{
                  display: "grid",
                  gap: 14,
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                }}
              >
                <MiniMetric label="Win Rate" value={`${winRate.toFixed(1)}%`} />
                <MiniMetric label="Wins" value={String(wins)} />
                <MiniMetric label="Losses" value={String(losses)} />
                <MiniMetric
                  label="ROI"
                  value={`${roi.toFixed(1)}%`}
                  color={roi >= 0 ? "#16a34a" : "#dc2626"}
                />
                <MiniMetric
                  label="Profit"
                  value={`$${totalPnL.toFixed(2)}`}
                  color={totalPnL >= 0 ? "#16a34a" : "#dc2626"}
                />
                <MiniMetric label="Total Bets" value={String(closedBets.length)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>📊 Bet Tracker</CardTitle>
            </CardHeader>
            <CardContent>
              {trackedBets.length === 0 ? (
                <Subtle>No bets tracked yet.</Subtle>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {trackedBets.map((bet) => (
                    <div
                      key={bet.id}
                      style={{
                        border: "1px solid #e9d5ff",
                        borderRadius: 16,
                        padding: 14,
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 900, color: "#2e1065" }}>{bet.title}</div>
                          <div style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
                            Entry: {bet.entryPrice}¢ | Stake: ${bet.stake}
                          </div>
                          <div style={{ color: "#7c3aed", fontSize: 12, marginTop: 4 }}>
                            Status: {bet.status}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {bet.status === "open" && (
                            <>
                              <button
                                onClick={() => settleBet(bet.id, "win")}
                                style={actionBtn("#16a34a")}
                              >
                                Win
                              </button>
                              <button
                                onClick={() => settleBet(bet.id, "loss")}
                                style={actionBtn("#dc2626")}
                              >
                                Loss
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => removeBet(bet.id)}
                            style={actionBtn("#6d28d9")}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>How the edge is calculated</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ color: "#475569", lineHeight: 1.7 }}>
              <p>
                This version scores YES contracts with a simple formula:{" "}
                <strong>edge = your true probability % - Kalshi YES price in cents</strong>.
              </p>
              <p>
                Example: if your model says a prop hits 58% and the YES ask is 51¢,
                the edge is about 7%.
              </p>
              <p>
                For real use, replace the placeholder model modes with your own
                projection source or sportsbook-derived fair probability model.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  value,
  color = "#2e1065",
}: {
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        fontSize: 34,
        fontWeight: 900,
        color,
        letterSpacing: -1,
      }}
    >
      {value}
    </div>
  );
}

function Subtle({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return <div style={{ color: "#64748b", fontSize: 14, ...style }}>{children}</div>;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#4c1d95",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  color = "#2e1065",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #e9d5ff",
        borderRadius: 16,
        padding: 14,
        background: "#faf5ff",
      }}
    >
      <div style={{ fontSize: 13, color: "#7c3aed", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string | number;
  strong?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid #e9d5ff",
        borderRadius: 16,
        padding: 12,
        background: strong ? "#f3e8ff" : "#faf5ff",
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
          fontSize: 18,
          fontWeight: strong ? 900 : 700,
          color: strong ? "#6d28d9" : "#2e1065",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function actionBtn(bg: string): React.CSSProperties {
  return {
    padding: "8px 12px",
    borderRadius: 10,
    border: "none",
    background: bg,
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };
}
