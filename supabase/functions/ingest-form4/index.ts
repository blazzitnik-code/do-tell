// Do Tell — SEC Form 4 ingest
// For every active person/trust in `entities` with an SEC CIK: read the owner's EDGAR submissions,
// fetch new Form 4 / 4/A XML, store the filing and one trade per non-derivative transaction.
// Query params: ?days=30 (lookback on filing date). Auth: x-cron-secret header must match CRON_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4";

const UA = Deno.env.get("SEC_USER_AGENT") ?? "Do Tell contact@example.com";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  isArray: (n) => ["nonDerivativeTransaction", "derivativeTransaction", "reportingOwner"].includes(n),
});

// ticker → sector for linking with policy events (extend as the universe grows)
const SECTOR: Record<string, string> = {
  DJT: "media", PSQH: "media", RUM: "media",
  ABTC: "crypto", HUT: "crypto", MSTR: "crypto", COIN: "crypto", HOOD: "crypto", GLXY: "crypto",
  XXI: "crypto", TRON: "crypto", ALTS: "crypto", DOMH: "crypto", BMNR: "crypto", SBET: "crypto",
  NVDA: "semis", AMD: "semis", INTC: "semis", TSM: "semis",
  LMT: "defense", RTX: "defense", PLTR: "defense", NOC: "defense", GD: "defense",
  XOM: "energy", CVX: "energy", LLY: "pharma", PFE: "pharma",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function sec(url: string, tries = 3): Promise<Response> {
  for (let a = 1; ; a++) {
    await sleep(150 * a); // SEC fair-access: stay well under 10 req/s, back off on retry
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" } });
    if (r.ok) return r;
    if (a >= tries || ![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`${r.status} ${url}`);
    await sleep(1000 * a);
  }
}
// deno-lint-ignore no-explicit-any
const val = (x: any) => (x && typeof x === "object" && "value" in x ? x.value : x) ?? null;
const num = (x: unknown) => { const n = Number(val(x)); return Number.isFinite(n) ? n : null; };

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) return new Response("forbidden", { status: 403 });

  const days = Number(new URL(req.url).searchParams.get("days") ?? 30);
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const { data: run } = await sb.from("source_runs").insert({ source: "form4" }).select("id").single();
  let itemsNew = 0;
  const errors: string[] = [];

  try {
    const { data: ents, error } = await sb.from("entities")
      .select("id,slug,sec_cik").eq("active", true).in("kind", ["person", "trust"]).not("sec_cik", "is", null);
    if (error) throw error;

    for (const e of ents ?? []) {
      try {
        const cik = String(Number(e.sec_cik));
        const sub = await (await sec(`https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`)).json();
        const r = sub.filings.recent;
        for (let i = 0; i < r.form.length; i++) {
          if (!["4", "4/A"].includes(r.form[i]) || r.filingDate[i] < since) continue;
          const acc: string = r.accessionNumber[i];
          const { data: seen } = await sb.from("filings").select("id").eq("source", "form4").eq("external_id", acc).maybeSingle();
          if (seen) continue;

          const folder = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, "")}`;
          const xml = await (await sec(`${folder}/${String(r.primaryDocument[i]).replace(/^xsl[^/]+\//, "")}`)).text();
          const doc = parser.parse(xml).ownershipDocument;
          const filedAt = r.acceptanceDateTime?.[i] || `${r.filingDate[i]}T21:00:00Z`;

          const { data: filing, error: fErr } = await sb.from("filings").insert({
            source: "form4", external_id: acc, entity_id: e.id, url: `${folder}/${r.primaryDocument[i]}`,
            filed_at: filedAt, raw: doc, status: "parsed",
          }).select("id").single();
          if (fErr) throw fErr;

          const issuerName = String(val(doc.issuer?.issuerName) ?? "");
          const sym = String(val(doc.issuer?.issuerTradingSymbol) ?? "").trim().toUpperCase() || issuerName.slice(0, 24);
          await sb.from("assets").upsert(
            { symbol: sym, name: issuerName, asset_class: "Equity", sector: SECTOR[sym] ?? null },
            { onConflict: "symbol", ignoreDuplicates: true },
          );

          const txs = doc.nonDerivativeTable?.nonDerivativeTransaction ?? [];
          // deno-lint-ignore no-explicit-any
          const rows = txs.map((t: any, k: number) => {
            const code = val(t.transactionCoding?.transactionCode);
            const ad = val(t.transactionAmounts?.transactionAcquiredDisposedCode);
            const shares = num(t.transactionAmounts?.transactionShares);
            const px = num(t.transactionAmounts?.transactionPricePerShare);
            return {
              external_key: `${acc}:${k}`, source: "form4", entity_id: e.id, filing_id: filing.id,
              asset_symbol: sym, asset_name: issuerName, asset_class: "Equity", sector: SECTOR[sym] ?? "other",
              side: code === "P" ? "buy" : code === "S" ? "sell" : ad === "D" ? "sell" : "buy", quantity: shares,
              amount_usd: shares != null && px ? Math.round(shares * px * 100) / 100 : null,
              executed_at: `${val(t.transactionDate)}T20:00:00Z`, disclosed_at: filedAt,
              confidence: 3, tx_code: code, open_market: code === "P" || code === "S",
            };
          });
          if (rows.length) {
            const { data: ins, error: tErr } = await sb.from("trades")
              .upsert(rows, { onConflict: "source,external_key", ignoreDuplicates: true }).select("id");
            if (tErr) throw tErr;
            itemsNew += ins?.length ?? 0;
          }
        }
      } catch (err) {
        errors.push(`${e.slug}: ${(err as Error).message}`);
      }
    }
    if (itemsNew) await sb.rpc("relink_trades");
    await sb.from("source_runs").update({
      finished_at: new Date().toISOString(), status: errors.length ? "partial" : "ok",
      items_new: itemsNew, error: errors.join("; ") || null,
    }).eq("id", run!.id);
    return Response.json({ ok: true, itemsNew, errors });
  } catch (err) {
    await sb.from("source_runs").update({
      finished_at: new Date().toISOString(), status: "error", items_new: itemsNew, error: (err as Error).message,
    }).eq("id", run!.id);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
