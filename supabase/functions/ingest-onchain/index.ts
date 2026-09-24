// Do Tell — on-chain movements of watched wallets (Ethereum mainnet via Alchemy, free tier).
// Polls alchemy_getAssetTransfers from the last processed block for every active Ethereum wallet (in and out),
// prices each transfer (CoinGecko, free), keeps moves ≥ MIN_USD, and stores them as trades (side "transfer",
// direction + counterparty in the name). Runs every 2 minutes via pg_cron. Auth: x-cron-secret. ?days=N for backfill.
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RPC = `https://eth-mainnet.g.alchemy.com/v2/${Deno.env.get("ALCHEMY_API_KEY")}`;
const HELIUS = Deno.env.get("HELIUS_API_KEY");
// Solana mints we can price (CoinGecko ids). Unpriced spam/airdrop tokens are ignored.
const SOL_MINTS: Record<string, { sym: string; cg: string; cls: string }> = {
  "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN": { sym: "TRUMP", cg: "official-trump", cls: "Token" },
  "So11111111111111111111111111111111111111112": { sym: "SOL", cg: "solana", cls: "Crypto" },
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { sym: "USDC", cg: "usd-coin", cls: "Token" },
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB": { sym: "USD1", cg: "usd1-wlfi", cls: "Token" },
};
// deno-lint-ignore no-explicit-any
async function solanaMoves(w: any, sinceTs: number) {
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  let before = "";
  for (let page = 0; page < 20; page++) {
    const r = await fetch(`https://api.helius.xyz/v0/addresses/${w.address}/transactions?api-key=${HELIUS}&limit=100${before ? `&before=${before}` : ""}`);
    if (!r.ok) throw new Error(`helius ${r.status}`);
    const txs = await r.json();
    if (!txs.length) break;
    for (const t of txs) {
      if (t.timestamp < sinceTs) return out;
      for (const x of t.tokenTransfers ?? []) {
        const m = SOL_MINTS[x.mint];
        if (!m || (x.fromUserAccount !== w.address && x.toUserAccount !== w.address)) continue;
        out.push({ sig: t.signature, ts: t.timestamp, m, qty: Number(x.tokenAmount), dir: x.fromUserAccount === w.address ? "OUT" : "IN", other: x.fromUserAccount === w.address ? x.toUserAccount : x.fromUserAccount });
      }
      for (const x of t.nativeTransfers ?? []) {
        if (x.fromUserAccount !== w.address && x.toUserAccount !== w.address) continue;
        out.push({ sig: t.signature, ts: t.timestamp, m: SOL_MINTS["So11111111111111111111111111111111111111112"], qty: x.amount / 1e9, dir: x.fromUserAccount === w.address ? "OUT" : "IN", other: x.fromUserAccount === w.address ? x.toUserAccount : x.fromUserAccount });
      }
    }
    before = txs[txs.length - 1].signature;
  }
  return out;
}
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

    // ---- Bitcoin (mempool.space, free) ----
    const { data: btcW } = await sb.from("wallets").select("id,entity_id,address,label,confidence").eq("chain", "bitcoin").eq("active", true);
    if (btcW?.length) {
      const btcUsd = (await (await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd")).json().catch(() => ({})))?.bitcoin?.usd ?? 0;
      const sinceTs = days ? Math.floor(Date.now() / 1000 - days * 86400) : Math.floor(Date.now() / 1000 - 3 * 86400);
      const btcRows = [];
      for (const w of btcW) {
        let url = `https://mempool.space/api/address/${w.address}/txs`;
        for (let page = 0; page < (days ? 8 : 1); page++) {
          await new Promise((res) => setTimeout(res, 700)); // mempool.space fair use
          const r = await fetch(url);
          if (r.status === 429) break; // rate-limited: continue next run
          if (!r.ok) throw new Error(`mempool ${r.status}`);
          // deno-lint-ignore no-explicit-any
          const txs: any[] = await r.json();
          if (!txs.length) break;
          let old = false;
          for (const t of txs) {
            const ts = t.status?.block_time ?? Math.floor(Date.now() / 1000);
            if (ts < sinceTs) { old = true; continue; }
            // deno-lint-ignore no-explicit-any
            const inSats = t.vout.filter((o: any) => o.scriptpubkey_address === w.address).reduce((a: number, o: any) => a + o.value, 0);
            // deno-lint-ignore no-explicit-any
            const outSats = t.vin.filter((i: any) => i.prevout?.scriptpubkey_address === w.address).reduce((a: number, i: any) => a + i.prevout.value, 0);
            const net = (inSats - outSats) / 1e8;
            if (!net) continue;
            // deno-lint-ignore no-explicit-any
            const cp = net < 0 ? t.vout.find((o: any) => o.scriptpubkey_address && o.scriptpubkey_address !== w.address)?.scriptpubkey_address
                               : t.vin.find((i: any) => i.prevout?.scriptpubkey_address !== w.address)?.prevout?.scriptpubkey_address;
            const usd = Math.abs(net) * btcUsd;
            if (usd < MIN_USD) continue;
            const iso = new Date(ts * 1000).toISOString();
            btcRows.push({
              external_key: `${t.txid}:${w.id}`, source: "onchain", entity_id: w.entity_id, wallet_id: w.id,
              asset_symbol: "BTC", asset_name: `${net < 0 ? "OUT → " : "IN ← "}${cp ? short(cp) : "?"} · ${w.label ?? short(w.address)}`,
              asset_class: "Crypto", sector: "crypto", side: "transfer", quantity: Math.abs(net), amount_usd: Math.round(usd),
              executed_at: iso, disclosed_at: iso, confidence: w.confidence, tx_hash: t.txid, tx_code: net < 0 ? "OUT" : "IN", open_market: true,
            });
          }
          if (old || txs.length < 25) break;
          url = `https://mempool.space/api/address/${w.address}/txs/chain/${txs[txs.length - 1].txid}`;
        }
      }
      for (let i = 0; i < btcRows.length; i += 200) {
        const { data, error: bErr } = await sb.from("trades").upsert(btcRows.slice(i, i + 200), { onConflict: "source,external_key", ignoreDuplicates: true }).select("id");
        if (bErr) throw bErr;
        itemsNew += data?.length ?? 0;
      }
    }

    // ---- Solana (Helius) ----
    const { data: solW } = await sb.from("wallets").select("id,entity_id,address,label,confidence").eq("chain", "solana").eq("active", true);
    if (solW?.length && HELIUS) {
      const { data: sst } = await sb.from("ingest_state").select("value").eq("key", "onchain:solana:ts").maybeSingle();
      const sinceTs = days ? Math.floor(Date.now() / 1000 - days * 86400) : sst ? Number(sst.value) - 120 : Math.floor(Date.now() / 1000 - 86400);
      const px = await (await fetch(`https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=${[...new Set(Object.values(SOL_MINTS).map((m) => m.cg))].join(",")}`)).json().catch(() => ({}));
      const solRows = [];
      for (const w of solW) {
        for (const mv of await solanaMoves(w, sinceTs)) {
          const usd = mv.qty * (px?.[mv.m.cg]?.usd ?? 0);
          if (usd < MIN_USD) continue;
          const iso = new Date(mv.ts * 1000).toISOString();
          solRows.push({
            external_key: `${mv.sig}:${mv.m.sym}:${mv.dir}:${w.id}`, source: "onchain", entity_id: w.entity_id, wallet_id: w.id,
            asset_symbol: mv.m.sym, asset_name: `${mv.dir === "OUT" ? "OUT → " : "IN ← "}${short(mv.other ?? "")} · ${w.label ?? short(w.address)}`,
            asset_class: mv.m.cls, sector: "crypto", side: "transfer", quantity: mv.qty, amount_usd: Math.round(usd),
            executed_at: iso, disclosed_at: iso, confidence: w.confidence, tx_hash: mv.sig, tx_code: mv.dir, open_market: true,
          });
        }
      }
      for (let i = 0; i < solRows.length; i += 200) {
        const { data, error: sErr } = await sb.from("trades").upsert(solRows.slice(i, i + 200), { onConflict: "source,external_key", ignoreDuplicates: true }).select("id");
        if (sErr) throw sErr;
        itemsNew += data?.length ?? 0;
      }
      await sb.from("ingest_state").upsert({ key: "onchain:solana:ts", value: String(Math.floor(Date.now() / 1000)), updated_at: new Date().toISOString() });
    }
    if (itemsNew) await sb.rpc("relink_trades");
    await sb.from("source_runs").update({ finished_at: new Date().toISOString(), status: "ok", items_new: itemsNew }).eq("id", run!.id);
    return Response.json({ ok: true, blocks: latest - from + 1, wallets: wallets?.length, moves: moves.length, itemsNew });
  } catch (err) {
    await sb.from("source_runs").update({ finished_at: new Date().toISOString(), status: "error", error: (err as Error).message }).eq("id", run!.id);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
