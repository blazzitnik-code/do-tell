// Keyword → sector classifier for policy events and statements. Order = priority on ties.
export const SECTOR_KEYWORDS: Record<string, RegExp> = {
  crypto: /\b(crypto(?!graph)|digital asset|bitcoin|stablecoin|blockchain|virtual currenc|tokeni[sz])/i,
  tech: /\b(semiconductor|chips?\b|microelectronic|artificial intelligence|\bAI\b|export control|advanced computing|data center|cloud computing|online platform|social media platform|big tech|antitrust)/i,
  defense: /\b(defen[cs]e|military|armed forces|department of war|munition|weapon|drone|shipbuilding|missile|golden dome|national guard)/i,
  pharma: /\b(drug pric|prescription drug|pharmac|vaccine|biotech|medicare|medicaid|most favored nation|generic drug|FDA)/i,
  energy: /\b(energy|oil|natural gas|lng|drilling|coal|nuclear|pipeline|offshore|critical mineral|mining|electric grid|power plant|refiner)/i,
  media: /\b(broadcast|censorship|tiktok|press freedom|public media|npr|pbs)/i,
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
  ...T("tech", "NVDA AMD INTC TSM AMAT LRCX KLAC ASML AVGO QCOM MU TXN ARM SMCI MRVL ON ADI NXPI MCHP SOXX SMH AEIS"),
  ...T("tech", "GOOGL GOOG MSFT META AMZN AAPL ORCL CRM ADBE NOW IBM UBER SHOP TSLA PANW CRWD SNOW DELL HPE NET PLTR TEM XLK VGT"),
  ...T("defense", "LMT RTX NOC GD BA LHX HII LDOS KTOS AVAV AXON"),
  ...T("energy", "XOM CVX COP OXY EOG SLB HAL PSX MPC VLO NEE CEG VST SMR OKLO CCJ FCX MP LNG XLE BE DVN CMS DUK SO ETN PWR GEV"),
  ...T("pharma", "LLY PFE JNJ MRK ABBV BMY AMGN GILD NVO REGN VRTX UNH CVS XLV"),
  ...T("media", "DJT PSQH RUM DIS PARA WBD CMCSA FOXA NFLX"),
  ...T("macro", "SPY VOO IVV QQQ DIA TLT IEF SHY GLD"),
]);
export function sectorFor(symbol: string | null, name = ""): string {
  return (symbol && TICKER_SECTOR[symbol.toUpperCase()]) || classify(name) || "other";
}

// Company / token names as they appear in posts → ticker. Word-bounded, case-insensitive.
export const NAME_TICKER: [RegExp, string][] = [
  [/\bboeing\b/i, "BA"], [/\bintel (corp(oration)?|stake|chips?|fabs?)\b/i, "INTC"], [/\bnvidia\b/i, "NVDA"], [/\bapple\b/i, "AAPL"], [/\bmicrosoft\b/i, "MSFT"],
  [/\b(google|alphabet)\b/i, "GOOGL"], [/\bamazon\b/i, "AMZN"], [/\b(meta platforms|facebook)\b/i, "META"], [/\btesla\b/i, "TSLA"],
  [/\boracle\b/i, "ORCL"], [/\bpalantir\b/i, "PLTR"], [/\bmicron\b/i, "MU"], [/\b(tsmc|taiwan semiconductor)\b/i, "TSM"], [/\bamd\b/i, "AMD"],
  [/\bexxon\b/i, "XOM"], [/\bchevron\b/i, "CVX"], [/\blockheed\b/i, "LMT"], [/\braytheon\b/i, "RTX"], [/\bpfizer\b/i, "PFE"],
  [/\b(eli lilly|lilly)\b/i, "LLY"], [/\bgeneral motors\b/i, "GM"], [/\bford motor\b/i, "F"], [/\bcoinbase\b/i, "COIN"],
  [/\b(trump media|truth social)\b/i, "DJT"], [/\bbitcoin\b/i, "BTC"], [/\bworld liberty\b/i, "WLFI"], [/\$TRUMP\b/, "TRUMP"],
];
// "available on Amazon", book and film plugs are not about the company.
const PLUG = /\b(book|film|movie|documentary|pre-?order|available (now )?(on|at))\b/i;
export function tickersIn(text: string): string[] {
  const out = new Set(NAME_TICKER.filter(([re]) => re.test(text)).map(([, t]) => t));
  if (PLUG.test(text)) out.delete("AMZN");
  return [...out];
}
