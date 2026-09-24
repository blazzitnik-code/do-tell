// Do Tell — on-chain movements of watched wallets (Ethereum mainnet via Alchemy, free tier).
// Polls alchemy_getAssetTransfers from the last processed block for every active Ethereum wallet (in and out),
// prices each transfer (CoinGecko, free), keeps moves ≥ MIN_USD, and stores them as trades (side "transfer",
// direction + counterparty in the name). Runs every 2 minutes via pg_cron. Auth: x-cron-secret. ?days=N for backfill.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RPC = `https://eth-mainnet.g.alchemy.com/v2/${Deno.env.get("ALCHEMY_API_KEY")}`;
const MIN_USD = 10_000;
const STABLE = new Set(["USD1", "USDC", "USDT", "DAI", "PYUSD", "FDUSD", "USDE"]);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
// Well-known exchange hot wallets (Etherscan name tags) — a move to an exchange usually precedes a sale.
const KNOWN: Record<string, string> = {
  "0x28c6c06298d514db089934071355e5743bf21d60": "Binance (exchange)", "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "Binance (exchange)",
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": "Binance (exchange)", "0xf977814e90da44bfa03b6295a0616a897441acec": "Binance (exchange)",
  "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": "Coinbase (exchange)", "0x503828976d22510aad0201ac7ec88293211d23da": "Coinbase (exchange)",
  "0x2910543af39aba0cd09dbb2d50200b3e800a63d2": "Kraken (exchange)",
};

// deno-lint-ignore no-explicit-any
async function rpc(method: string, params: unknown[]): Promise<any> {
  const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const d = await r.json();
  if (d.error) throw new Error(`${method}: ${d.error.message}`);
  return d.result;
}
// deno-lint-ignore no-explicit-any
async function transfers(dir: "fromAddress" | "toAddress", addr: string, fromBlock: string, toBlock: string): Promise<any[]> {
  const out = [];
  let pageKey: string | undefined;
  do {
    const res = await rpc("alchemy_getAssetTransfers", [{ fromBlock, toBlock, [dir]: addr, category: ["external", "erc20"],
      withMetadata: true, excludeZeroValue: true, maxCount: "0x3e8", ...(pageKey ? { pageKey } : {}) }]);
    out.push(...res.transfers);
    pageKey = res.pageKey;
  } while (pageKey && out.length < 5000);
  return out;
}
async function prices(contracts: string[]): Promise<Record<string, number>> {
  const p: Record<string, number> = {};
  const eth = await (await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")).json().catch(() => ({}));
  p["eth"] = eth?.ethereum?.usd ?? 0;
  for (let i = 0; i < contracts.length; i += 30) {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/ethereum?vs_currencies=usd&contract_addresses=${contracts.slice(i, i + 30).join(",")}`);
    if (r.ok) for (const [k, v] of Object.entries(await r.json())) p[k.toLowerCase()] = (v as { usd?: number }).usd ?? 0;
  }
  return p;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) return new Response("forbidden", { status: 403 });
  const days = Number(new URL(req.url).searchParams.get("days") ?? 0);
  const { data: run } = await sb.from("source_runs").insert({ source: "onchain" }).select("id").single();
  try {
    const latest = parseInt(await rpc("eth_blockNumber", []), 16);
    const { data: st } = await sb.from("ingest_state").select("value").eq("key", "onchain:ethereum:block").maybeSingle();
    const from = days ? latest - Math.round(days * 7200) : st ? Number(st.value) + 1 : latest - 7200;
    if (from > latest) return Response.json({ ok: true, itemsNew: 0 });
    const { data: wallets, error } = await sb.from("wallets").select("id,entity_id,address,label,confidence").eq("chain", "ethereum").eq("active", true);
    if (error) throw error;
    const watched = new Map((wallets ?? []).map((w) => [w.address.toLowerCase(), w]));
    // deno-lint-ignore no-explicit-any
    const moves: { w: any; t: any; dir: "IN" | "OUT" }[] = [];
    for (const w of wallets ?? []) {
      const fb = "0x" + from.toString(16), tb = "0x" + latest.toString(16);
      for (const t of await transfers("fromAddress", w.address, fb, tb)) moves.push({ w, t, dir: "OUT" });
      for (const t of await transfers("toAddress", w.address, fb, tb)) moves.push({ w, t, dir: "IN" });
    }
    const contracts = [...new Set(moves.map((m) => m.t.rawContract?.address).filter(Boolean).map((a: string) => a.toLowerCase()))];
    const px = moves.length ? await prices(contracts) : {};
    const rows = moves.map(({ w, t, dir }) => {
      const sym = String(t.asset ?? "").toUpperCase();
      const contract = t.rawContract?.address?.toLowerCase();
      const qty = Number(t.value ?? 0);
      const usd = t.category === "external" ? qty * (px["eth"] ?? 0) : STABLE.has(sym) ? qty : qty * (px[contract] ?? 0);
      const other = (dir === "OUT" ? t.to : t.from)?.toLowerCase() ?? "";
      const otherLabel = watched.get(other)?.label ?? KNOWN[other] ?? short(other);
      return {
        external_key: `${t.uniqueId}:${w.id}`, source: "onchain", entity_id: w.entity_id, wallet_id: w.id,
        asset_symbol: sym || "ETH", asset_name: `${dir === "OUT" ? "OUT → " : "IN ← "}${otherLabel} · ${w.label ?? short(w.address)}`,
        asset_class: sym === "ETH" || t.category === "external" ? "Crypto" : "Token", sector: "crypto",
        side: "transfer", quantity: qty, amount_usd: Math.round(usd), executed_at: t.metadata.blockTimestamp, disclosed_at: t.metadata.blockTimestamp,
        confidence: w.confidence, tx_hash: t.hash, tx_code: dir, open_market: true,
      };
    }).filter((r) => r.amount_usd >= MIN_USD);
    let itemsNew = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error: tErr } = await sb.from("trades").upsert(rows.slice(i, i + 200), { onConflict: "source,external_key", ignoreDuplicates: true }).select("id");
      if (tErr) throw tErr;
      itemsNew += data?.length ?? 0;
    }
    await sb.from("ingest_state").upsert({ key: "onchain:ethereum:block", value: String(latest), updated_at: new Date().toISOString() });
    if (itemsNew) await sb.rpc("relink_trades");
    await sb.from("source_runs").update({ finished_at: new Date().toISOString(), status: "ok", items_new: itemsNew }).eq("id", run!.id);
    return Response.json({ ok: true, blocks: latest - from + 1, wallets: wallets?.length, moves: moves.length, itemsNew });
  } catch (err) {
    await sb.from("source_runs").update({ finished_at: new Date().toISOString(), status: "error", error: (err as Error).message }).eq("id", run!.id);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
