// Keyword → sector classifier for policy events and statements. Order = priority on ties.
export const SECTOR_KEYWORDS: Record<string, RegExp> = {
  crypto: /\b(crypto(?!graph)|digital asset|bitcoin|stablecoin|blockchain|virtual currenc|tokeni[sz])/i,
  semis: /\b(semiconductor|chip|microelectronic|artificial intelligence|\bAI\b|export control|advanced computing|data center)/i,
  defense: /\b(defen[cs]e|military|armed forces|department of war|munition|weapon|drone|shipbuilding|missile|golden dome|national guard)/i,
  pharma: /\b(drug pric|prescription drug|pharmac|vaccine|biotech|medicare|medicaid|most favored nation|generic drug|FDA)/i,
  energy: /\b(energy|oil|natural gas|lng|drilling|coal|nuclear|pipeline|offshore|critical mineral|mining|electric grid|power plant|refiner)/i,
  media: /\b(broadcast|social media|censorship|tiktok|press freedom|public media|npr|pbs)/i,
  macro: /\b(tariff|duties|reciprocal|trade agreement|import|treasury|interest rate|federal reserve|debt|tax|dollar|inflation|sanction)/i,
};
export function classify(text: string): string | null {
  let best: string | null = null, hits = 0;
  for (const [sector, re] of Object.entries(SECTOR_KEYWORDS)) {
    const n = (text.match(new RegExp(re.source, "gi")) ?? []).length;
    if (n > hits) { best = sector; hits = n; }
  }
  return best;
}

// Ticker → sector (extend as the universe grows). Unknown tickers fall back to classify(asset name) or "other".
const T = (sector: string, list: string) => list.split(" ").map((t) => [t, sector] as const);
export const TICKER_SECTOR: Record<string, string> = Object.fromEntries([
  ...T("crypto", "ABTC HUT MSTR COIN HOOD GLXY XXI TRON ALTS DOMH BMNR SBET IBIT FBTC ETHA BITB GBTC RIOT MARA CLSK CRCL CIFR WULF IREN BTC ETH SOL WLFI USD1 TRUMP"),
  ...T("semis", "NVDA AMD INTC TSM AMAT LRCX KLAC ASML AVGO QCOM MU TXN ARM SMCI MRVL ON ADI NXPI MCHP SOXX SMH"),
  ...T("defense", "LMT RTX PLTR NOC GD BA LHX HII LDOS KTOS AVAV AXON"),
  ...T("energy", "XOM CVX COP OXY EOG SLB HAL PSX MPC VLO NEE CEG VST SMR OKLO CCJ FCX MP LNG XLE"),
  ...T("pharma", "LLY PFE JNJ MRK ABBV BMY AMGN GILD NVO REGN VRTX UNH CVS XLV"),
  ...T("media", "DJT PSQH RUM DIS PARA WBD CMCSA FOXA NFLX"),
  ...T("macro", "SPY VOO IVV QQQ DIA TLT IEF SHY GLD"),
]);
export function sectorFor(symbol: string | null, name = ""): string {
  return (symbol && TICKER_SECTOR[symbol.toUpperCase()]) || classify(name) || "other";
}
