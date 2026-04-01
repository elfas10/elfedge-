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
  },
  balanced: {
    minEdge: 4,
    minVolume: 500,
    maxPrice: 70,
    maxSpread: 8,
    topN: 10,
  },
  strict: {
    minEdge: 6,
    minVolume: 2000,
    maxPrice: 60,
    maxSpread: 5,
    topN: 5,
  },
};
function isSportsMarket(market: any) {
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
  ];

  return sportsKeywords.some((keyword) => text.includes(keyword));
}

function getSpread(market: any) {
  if (market.yesBid == null || market.yesAsk == null) return null;
  return market.yesAsk - market.yesBid;
}
function getQualityScore(m: any) {
  const edgeScore = m.edge; // already %
  const volumeScore = Math.log10(m.volume + 1); // smooth scaling
  const spreadPenalty = m.spread != null ? m.spread * 10 : 0;

  return edgeScore * 2 + volumeScore * 5 - spreadPenalty;
}
const Card = ({ children, className = "" }: any) => (
  <div
    className={className}
    style={{
      border: "1px solid #e2e8f0",
      borderRadius: "16px",
      background: "white",
      padding: "0",
    }}
  >
    {children}
  </div>
);

const CardHeader = ({ children }: any) => (
  <div style={{ padding: "16px 20px 0 20px" }}>{children}</div>
);

const CardTitle = ({ children, className = "" }: any) => (
  <h2
    className={className}
    style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}
  >
    {children}
  </h2>
);

const CardContent = ({ children, className = "" }: any) => (
  <div className={className} style={{ padding: "16px 20px 20px 20px" }}>
    {children}
  </div>
);

const Button = ({ children, onClick, className = "", variant = "default" }: any) => (
  <button
    onClick={onClick}
    className={className}
    style={{
      padding: "10px 14px",
      borderRadius: "14px",
      border: variant === "outline" ? "1px solid #cbd5e1" : "none",
      background: variant === "outline" ? "white" : "#0f172a",
      color: variant === "outline" ? "#0f172a" : "white",
      cursor: "pointer",
      fontWeight: 600,
    }}
  >
    {children}
  </button>
);

const Input = ({ className = "", ...props }: any) => (
  <input
    {...props}
    className={className}
    style={{
      width: "100%",
      padding: "10px 12px",
      borderRadius: "10px",
      border: "1px solid #cbd5e1",
      fontSize: "14px",
      boxSizing: "border-box",
    }}
  />
);

const Badge = ({ children, variant = "secondary" }: any) => (
  <span
    style={{
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: 600,
      border: variant === "outline" ? "1px solid #cbd5e1" : "none",
      background: variant === "outline" ? "white" : "#e2e8f0",
      color: "#0f172a",
    }}
  >
    {children}
  </span>
);
const API_BASE = "/api/kalshi-markets";
const DEFAULT_MODEL_PROB = 55;

function clamp(num: any, min: any, max: any) {
  return Math.min(Math.max(num, min), max);
}

function toPercentFromDollarString(value: any) {
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return n * 100;
}

function formatPct(value, digits: any = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

function formatCurrencyCents(pricePct: any) {
  if (pricePct === null || pricePct === undefined || Number.isNaN(pricePct))
    return "—";
  return `${Math.round(pricePct)}¢`;
}

function calcExpectedValuePct(trueProbPct: any, yesPricePct: any) {
  // 1 contract costs yesPricePct cents and pays 100 cents if YES resolves true.
  // EV in cents = p*100 - price
  return trueProbPct - yesPricePct;
}

function calcROI(trueProbPct: any, yesPricePct: any) {
  if (!yesPricePct) return null;
  return ((trueProbPct - yesPricePct) / yesPricePct) * 100;
}

function inferModelProb(market: any, sliderProb: any, mode: any) {
  const yesMid = market.yesMid ?? market.lastTrade ?? 50;

  if (mode === "manual") return sliderProb;

  if (mode === "marketPlus") {
    // Simple built-in edge model: take market probability and add a bias.
    // This is not a predictive model, just a fast demo baseline for idea testing.
    return clamp(yesMid + 4, 1, 99);
  }

  if (mode === "contrarian") {
    return clamp(100 - yesMid, 1, 99);
  }

  return sliderProb;
}

async function fetchAllOpenMarkets() {
  const res = await fetch("/api/kalshi-markets");

  if (!res.ok) {
    throw new Error(`Proxy failed (${res.status})`);
  }

  const data = await res.json();
  return data.markets || [];
}

function normalizeMarket(m: any) {
  const yesBid = toPercentFromDollarString(m.yes_bid_dollars);
  const yesAsk = toPercentFromDollarString(m.yes_ask_dollars);
  const noBid = toPercentFromDollarString(m.no_bid_dollars);
  const noAsk = toPercentFromDollarString(m.no_ask_dollars);
  const lastTrade = toPercentFromDollarString(m.last_price_dollars);

  let yesMid = null;
  if (yesBid !== null && yesAsk !== null) yesMid = (yesBid + yesAsk) / 2;
  else if (lastTrade !== null) yesMid = lastTrade;
  else if (yesBid !== null) yesMid = yesBid;
  else if (yesAsk !== null) yesMid = yesAsk;

  return {
    ticker: m.ticker,
    title: m.title || m.subtitle || m.ticker,
    subtitle: m.yes_sub_title || m.no_sub_title || "",
    status: m.status,
    closeTime: m.close_time,
    openTime: m.open_time,
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
  const [markets, setMarkets] = useState([]);
  const [trackedBets, setTrackedBets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("balanced");
  useEffect(() => {
    const saved = localStorage.getItem("kalshiTrackedBets");
    if (saved) {
      try {
        setTrackedBets(JSON.parse(saved));
      } catch (err) {
        console.error("Failed to parse tracked bets:", err);
      }
    }
  }, []);
  useEffect(() => {
    localStorage.setItem("kalshiTrackedBets", JSON.stringify(trackedBets));
  }, [trackedBets]);
  const activePreset = MODE_PRESETS[mode];
  function addBetToTracker(market: any) {
    const newBet = {
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

    setTrackedBets((prev: any) => {
      const alreadyExists = prev.some(
        (bet: any) => bet.ticker === newBet.ticker && bet.status === "open"
      );
      if (alreadyExists) return prev;
      return [newBet, ...prev];
    });
  }

  function settleBet(id: any, result: any) {
    setTrackedBets((prev: any) =>
      prev.map((bet: any) => {
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

  function removeBet(id: any) {
    setTrackedBets((prev: any) => prev.filter((bet: any) => bet.id !== id));
  }
  const [minEdge, setMinEdge] = useState(3);
  const [minVolume, setMinVolume] = useState(0);
  const [maxPrice, setMaxPrice] = useState(75);
  const [modelProb, setModelProb] = useState(DEFAULT_MODEL_PROB);
  const [modelMode, setModelMode] = useState("manual");
  const [lastUpdated, setLastUpdated] = useState(null);

  const demoMarkets = [
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
      const raw = await fetchAllOpenMarkets(200, 3);
      const normalized = raw.map((m: any) => normalizeMarket(m));
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

  const computedMarkets = useMemo(() => {
    const preset = MODE_PRESETS[mode];
    return markets
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
      .filter((m) => isSportsMarket(m))
      .filter(Boolean)
      .filter((m) => m.spread == null || m.spread <= preset.maxSpread)
      .filter((m) => {
        const text = `${m.title} ${m.subtitle} ${m.ticker}`.toLowerCase();
        return text.includes(query.toLowerCase());
      })
      .filter((m) => m.edge >= preset.minEdge)
      .filter((m) => m.volume >= preset.minVolume)
      .filter((m) => m.price <= preset.maxPrice)
      .sort((a, b) => getQualityScore(b) - getQualityScore(a))
      .slice(0, preset.topN);
  }, [
    markets,
    query,
    minEdge,
    minVolume,
    maxPrice,
    modelProb,
    modelMode,
    mode,
  ]);
  const topPick = computedMarkets[0] || null;
  const stats = useMemo(() => {
    const total = computedMarkets.length;
    const avgEdge = total
      ? computedMarkets.reduce((sum: any, m: any) => sum + m.edge, 0) / total
      : 0;
    const best = total ? computedMarkets[0].edge : 0;
    return { total, avgEdge, best };
  }, [computedMarkets]);
  const closedBets = trackedBets.filter((b: any) => b.status === "closed");
  const wins = closedBets.filter((b) => b.result === "win").length;
  const losses = closedBets.filter((b) => b.result === "loss").length;

  const totalPnL = closedBets.reduce((sum: any, b: any) => sum + (b.pnl || 0), 0);
  const totalStaked = closedBets.reduce((sum: any, b: any) => sum + (b.stake || 0), 0);

  const winRate = closedBets.length > 0 ? (wins / closedBets.length) * 100 : 0;
  const roi = totalStaked > 0 ? (totalPnL / totalStaked) * 100 : 0;
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">
              Kalshi Edge Finder V2
            </h1>
            <p className="mt-2 text-slate-600">
              Live public Kalshi market feed + instant edge scoring for YES
              contracts.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Last updated:{" "}
              {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}
            </p>
          </div>

          <Button onClick={loadMarkets} className="gap-2 rounded-2xl shadow-sm">
            <RefreshCw className="h-4 w-4" /> Refresh live data
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl shadow-sm mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" />
                Top Pick Right Now
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topPick ? (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-semibold">
                        {topPick.title}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {topPick.subtitle || topPick.ticker}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Closes:{" "}
                        {topPick.closeTime
                          ? new Date(topPick.closeTime).toLocaleString()
                          : "—"}
                      </div>
                    </div>

                    <div className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium">
                      {topPick.status || "active"}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
                    <StatBlock
                      label="YES Ask"
                      value={
                        topPick.yesAsk != null ? `${topPick.yesAsk}¢` : "—"
                      }
                    />
                    <StatBlock
                      label="YES Bid"
                      value={
                        topPick.yesBid != null ? `${topPick.yesBid}¢` : "—"
                      }
                    />
                    <StatBlock
                      label="24H Volume"
                      value={
                        topPick.volume != null
                          ? topPick.volume.toLocaleString()
                          : "—"
                      }
                    />
                    <StatBlock
                      label="Model Prob"
                      value={
                        topPick.trueProb != null
                          ? `${Number(topPick.trueProb).toFixed(1)}%`
                          : "—"
                      }
                    />
                    <StatBlock
                      label="Edge"
                      value={
                        topPick.edge != null
                          ? `${Number(topPick.edge).toFixed(2)}%`
                          : "—"
                      }
                      strong
                    />
                    <StatBlock
                      label="ROI"
                      value={
                        topPick.roi != null
                          ? `${Number(topPick.roi).toFixed(2)}%`
                          : "—"
                      }
                    />
                  </div>

                  <p className="mt-4 text-sm text-slate-600">
                    This is the highest-ranked market based on your current
                    scanner mode, filters, spread threshold, and quality score.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  No top pick right now. Try refreshing live data, checking
                  closer to game time, or switching to a looser scanner mode.
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5" /> Best Edge
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {formatPct(stats.best, 2)}
              </div>
              <p className="text-sm text-slate-500">
                Highest expected edge on the board
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <DollarSign className="h-5 w-5" /> Avg Edge
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {formatPct(stats.avgEdge, 2)}
              </div>
              <p className="text-sm text-slate-500">
                Average edge after your filters
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="h-5 w-5" /> Matches
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total}</div>
              <p className="text-sm text-slate-500">
                Markets currently passing filters
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Filters + Model</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-2 lg:col-span-2">
              <label className="text-sm font-medium">Search markets</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Search by title or ticker"
                  value={query}
                  onChange={(e: any) => setQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Min edge %</label>
              <Input
                type="number"
                value={activePreset.minEdge}
                readOnly
                onChange={(e: any) => setMinEdge(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Min volume</label>
              <Input
                type="number"
                value={activePreset.minVolume}
                readOnly
                onChange={(e: any) => setMinVolume(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Max YES price (¢)</label>
              <Input
                type="number"
                value={activePreset.maxPrice}
                readOnly
                onChange={(e: any) => setMaxPrice(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Model probability %</label>
              <Input
                type="number"
                value={modelProb}
                onChange={(e: any) => setModelProb(e.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-2 lg:col-span-6">
              <label className="text-sm font-medium">Model mode</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "manual", label: "Manual probability" },
                  { key: "marketPlus", label: "Market + 4%" },
                  { key: "contrarian", label: "Contrarian demo" },
                ].map((option) => (
                  <Button
                    key={option.key}
                    variant={modelMode === option.key ? "default" : "outline"}
                    className="rounded-2xl"
                    onClick={() => setModelMode(option.key)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Manual probability is the most useful starting point. The
                built-in demo modes are placeholders until you plug in a real
                sports model.
              </p>
              <div style={{ marginTop: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: 600,
                    marginBottom: "8px",
                  }}
                >
                  Scanner mode
                </label>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    onClick={() => setMode("loose")}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "14px",
                      border: mode === "loose" ? "none" : "1px solid #cbd5e1",
                      background: mode === "loose" ? "#0f172a" : "white",
                      color: mode === "loose" ? "white" : "#0f172a",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Loose
                  </button>

                  <button
                    onClick={() => setMode("balanced")}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "14px",
                      border:
                        mode === "balanced" ? "none" : "1px solid #cbd5e1",
                      background: mode === "balanced" ? "#0f172a" : "white",
                      color: mode === "balanced" ? "white" : "#0f172a",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Balanced
                  </button>

                  <button
                    onClick={() => setMode("strict")}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "14px",
                      border: mode === "strict" ? "none" : "1px solid #cbd5e1",
                      background: mode === "strict" ? "#0f172a" : "white",
                      color: mode === "strict" ? "white" : "#0f172a",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Strict
                  </button>
                </div>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    marginTop: "8px",
                  }}
                >
                  Active mode controls edge, volume, price, spread, and number
                  of results shown.
                </p>
                <p
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    marginTop: "8px",
                  }}
                >
                  Loose shows more opportunities, Balanced is the default scan,
                  and Strict only shows the cleanest setups.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="rounded-2xl border-amber-300 bg-amber-50 shadow-sm">
            <CardContent className="flex items-start gap-3 p-4 text-amber-900">
              <AlertCircle className="mt-0.5 h-5 w-5" />
              <div>
                <p className="font-medium">Live feed issue</p>
                <p className="text-sm">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Top Kalshi edges</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 text-center text-slate-500">
                Loading live markets...
              </div>
            ) : computedMarkets.length === 0 ? (
              <div className="py-10 text-center text-slate-500">
                No markets match your current filters.
              </div>
            ) : (
              <div className="grid gap-4">
                {computedMarkets.slice(0, 40).map((market: any) => (
                  <Card
                    key={market.ticker}
                    className="rounded-2xl border border-slate-200"
                  >
                    <CardContent className="p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold leading-tight">
                              {market.title}
                            </h3>
                            <Badge variant="secondary">{market.ticker}</Badge>
                            <Badge variant="outline">{market.status}</Badge>
                          </div>
                          {market.subtitle ? (
                            <p className="text-sm text-slate-600">
                              {market.subtitle}
                            </p>
                          ) : null}
                          <p className="text-xs text-slate-500">
                            Closes:{" "}
                            {market.closeTime
                              ? new Date(market.closeTime).toLocaleString()
                              : "—"}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:min-w-[420px]">
                          <StatBlock
                            label="YES ask"
                            value={formatCurrencyCents(market.price)}
                          />
                          <StatBlock
                            label="YES bid"
                            value={formatCurrencyCents(market.yesBid)}
                          />
                          <StatBlock
                            label="24h volume"
                            value={market.volume.toLocaleString()}
                          />
                          <StatBlock
                            label="Model prob"
                            value={formatPct(market.trueProb, 1)}
                          />
                          <StatBlock
                            label="Edge"
                            value={formatPct(market.edge, 2)}
                            strong
                          />
                          <StatBlock
                            label="ROI"
                            value={formatPct(market.roi, 2)}
                          />
                        </div>
                        <div className="mt-4">
                          <button
                            onClick={() => addBetToTracker(market)}
                            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50"
                          >
                            Add to Tracker
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm mt-6">
          <CardHeader>
            <CardTitle>📈 Performance</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-slate-500">Win Rate</p>
                <p className="text-xl font-bold">{winRate.toFixed(1)}%</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Wins</p>
                <p className="text-xl font-bold">{wins}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Losses</p>
                <p className="text-xl font-bold">{losses}</p>
              </div>

              <div>
                <p className="text-sm text-slate-500">ROI</p>
                <p
                  className={`text-xl font-bold ${
                    roi >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {roi.toFixed(1)}%
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Profit</p>
                <p
                  className={`text-xl font-bold ${
                    totalPnL >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  ${totalPnL.toFixed(2)}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">Total Bets</p>
                <p className="text-xl font-bold">{closedBets.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm mt-6">
          <CardHeader>
            <CardTitle>📊 Bet Tracker</CardTitle>
          </CardHeader>

          <CardContent>
            {trackedBets.length === 0 ? (
              <p className="text-sm text-slate-500">No bets tracked yet.</p>
            ) : (
              <div className="space-y-3">
                {trackedBets.map((bet) => (
                  <div
                    key={bet.id}
                    className="border rounded-xl p-3 flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium">{bet.title}</p>
                      <p className="text-sm text-slate-500">
                        Entry: {bet.entryPrice}¢ | Stake: ${bet.stake}
                      </p>
                      <p className="text-xs">Status: {bet.status}</p>
                    </div>

                    <div className="flex gap-2">
                      {bet.status === "open" && (
                        <>
                          <button
                            onClick={() => settleBet(bet.id, "win")}
                            className="px-2 py-1 bg-green-500 text-white rounded"
                          >
                            Win
                          </button>
                          <button
                            onClick={() => settleBet(bet.id, "loss")}
                            className="px-2 py-1 bg-red-500 text-white rounded"
                          >
                            Loss
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => removeBet(bet.id)}
                        className="px-2 py-1 bg-gray-300 rounded"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>How the edge is calculated</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>
              This version scores YES contracts with a simple formula:{" "}
              <span className="font-semibold">
                edge = your true probability % - Kalshi YES price in cents
              </span>
              .
            </p>
            <p>
              Example: if your model says a prop hits 58% and the YES ask is
              51¢, the edge is about 7%.
            </p>
            <p>
              For real betting use, replace the placeholder model modes with
              your own projection source or sportsbook-derived fair probability
              model.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatBlock({ label, value, strong = false }: any) {
  return (
    <div className="rounded-2xl bg-slate-100 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={`mt-1 text-base ${strong ? "font-bold" : "font-semibold"}`}
      >
        {value}
      </div>
    </div>
  );
}
