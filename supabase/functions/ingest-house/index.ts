// Do Tell — House Periodic Transaction Reports (STOCK Act), free source: House Clerk.
// 1) Reads the yearly index {year}FD.zip → XML of all filings; keeps FilingType "P" (PTR).
// 2) Electronic PTRs (DocID 2xxxxxxx) → PDF text with positions → one trade per row.
//    Paper/scanned PTRs → stored as filings with status "quarantine" (no text layer).
// 3) Each filer becomes a Tier-3 entity automatically.
// Query: ?limit=8 PDFs per run (Edge CPU budget), ?year=2026. Auth: x-cron-secret.
import { createClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4";
import { unzipSync, strFromU8 } from "npm:fflate@0.8.2";
import { getDocumentProxy } from "npm:unpdf@0.12.1";
import { sectorFor } from "../_shared/sectors.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BASE = "https://disclosures-clerk.house.gov/public_disc";
const UA = { "User-Agent": Deno.env.get("SEC_USER_AGENT") ?? "Do Tell" };
const CLASS: Record<string, string> = { ST: "Equity", OP: "Option", EF: "Fund", MF: "Fund", GS: "Bond", CS: "Bond", CT: "Crypto" };

const usDate = (s: string) => { const [m, d, y] = s.split("/"); return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; };
const money = (s: string) => Number(s.replace(/[^0-9]/g, "")) || null;
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

type Item = { p: number; x: number; y: number; s: string };
type Row = { owner: string | null; asset: string; ticker: string | null; code: string | null; type: string; date: string; low: number | null; high: number | null; desc: string | null };

async function readPdf(url: string): Promise<Item[]> {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`pdf ${r.status}`);
  const pdf = await getDocumentProxy(new Uint8Array(await r.arrayBuffer()));
  const items: Item[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const c = await (await pdf.getPage(p)).getTextContent();
    // deno-lint-ignore no-explicit-any
    for (const it of c.items as any[]) {
      const s = String(it.str ?? "").replace(/\u0000/g, "").trim();
      if (s) items.push({ p, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), s });
    }
  }
  return items;
}

function parsePtr(items: Item[]): Row[] {
  const hx = (label: string, fallback: number) => items.find((i) => i.s === label)?.x ?? fallback;
  const cOwner = hx("Owner", 65), cAsset = hx("Asset", 104), cType = hx("Transaction", 261), cDate = hx("Date", 325),
    cNotif = hx("Notification", 382), cAmt = hx("Amount", 446), cCap = hx("Cap.", 526);
  const inCol = (i: Item, a: number, b: number) => i.x >= a - 3 && i.x < b - 3;
  const anchors = items.filter((i) => inCol(i, cType, cDate) && /^(P|S|S \(partial\)|E)$/.test(i.s))
    .sort((a, b) => a.p - b.p || b.y - a.y);
  const rows: Row[] = [];
  anchors.forEach((a, k) => {
    const next = anchors[k + 1];
    const lowerY = next && next.p === a.p ? next.y + 2 : -1;
    const band = (i: Item) => i.p === a.p && i.y <= a.y + 2 && i.y > lowerY;
    const assetLines = items.filter((i) => band(i) && inCol(i, cAsset, cType) && !/^(F\s*S|S\s*O|D\s*|C\s*)\s*:/.test(i.s) && !/^[A-Z]\s+[A-Z]\s*:/.test(i.s))
      .filter((i) => i.y > a.y - 30).sort((x, y) => y.y - x.y).map((i) => i.s);
    const asset = assetLines.join(" ").replace(/\s+/g, " ").trim();
    const date = items.find((i) => band(i) && Math.abs(i.y - a.y) <= 2 && inCol(i, cDate, cNotif) && /\d\d\/\d\d\/\d{4}/.test(i.s));
    const amt = items.filter((i) => band(i) && i.y > a.y - 16 && inCol(i, cAmt, cCap)).sort((x, y) => y.y - x.y).map((i) => i.s).join(" ");
    const owner = items.find((i) => band(i) && Math.abs(i.y - a.y) <= 2 && inCol(i, cOwner, cAsset))?.s ?? null;
    const desc = items.find((i) => band(i) && /^D\s*:/.test(i.s.replace(/[^\w:]/g, "").replace(/^D+/, "D")) && i.s.includes(":") && /option|strike|expire/i.test(i.s))?.s.replace(/^[^:]*:\s*/, "") ?? null;
    const nums = amt.match(/\$[\d,]+/g) ?? [];
    if (!date || !asset) return;
    rows.push({
      owner, asset, ticker: asset.match(/\(([A-Z][A-Z0-9.\-]{0,6})\)/)?.[1] ?? null, code: asset.match(/\[([A-Z]{2})\]/)?.[1] ?? null,
      type: a.s, date: usDate(date.s.match(/\d\d\/\d\d\/\d{4}/)![0]),
      low: nums[0] ? money(nums[0]) : null, high: /over/i.test(amt) ? null : nums[1] ? money(nums[1]) : null, desc,
    });
  });
  return rows;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) return new Response("forbidden", { status: 403 });
  const q = new URL(req.url).searchParams;
  const year = Number(q.get("year") ?? new Date().getUTCFullYear()), limit = Number(q.get("limit") ?? 8);
  const { data: run } = await sb.from("source_runs").insert({ source: "house" }).select("id").single();
  let itemsNew = 0, parsed = 0;
  const errors: string[] = [];
  try {
    const zip = new Uint8Array(await (await fetch(`${BASE}/financial-pdfs/${year}FD.zip`, { headers: UA })).arrayBuffer());
    const xml = strFromU8(unzipSync(zip)[`${year}FD.xml`]);
    // deno-lint-ignore no-explicit-any
    const members: any[] = new XMLParser({ parseTagValue: false }).parse(xml).FinancialDisclosure.Member;
    const ptrs = members.filter((m) => m.FilingType === "P");
    const ids = ptrs.map((m) => String(m.DocID));
    const { data: seen } = await sb.from("filings").select("external_id").eq("source", "house").in("external_id", ids);
    const done = new Set((seen ?? []).map((r) => r.external_id));
    const todo = ptrs.filter((m) => !done.has(String(m.DocID)))
      .sort((a, b) => usDate(b.FilingDate).localeCompare(usDate(a.FilingDate)));

    for (const m of todo) {
      const docId = String(m.DocID);
      const name = [m.Prefix, m.First, m.Last, m.Suffix].filter(Boolean).join(" ").replace(/\s+/g, " ");
      const slug = `house-${slugify(`${m.First} ${m.Last}`)}-${String(m.StateDst).toLowerCase()}`;
      const { data: ent, error: eErr } = await sb.from("entities").upsert({
        slug, name: `Rep. ${m.First} ${m.Last}`.replace(/\s+/g, " "), role: `House · ${m.StateDst}`, tier: 3, kind: "person",
      }, { onConflict: "slug", ignoreDuplicates: false }).select("id").single();
      if (eErr) { errors.push(`${docId}: ${eErr.message}`); continue; }
      const url = `${BASE}/ptr-pdfs/${year}/${docId}.pdf`;
      const filedAt = `${usDate(m.FilingDate)}T16:00:00Z`;
      const electronic = docId.startsWith("2");
      if (!electronic) {
        await sb.from("filings").upsert({ source: "house", external_id: docId, entity_id: ent.id, url, filed_at: filedAt, status: "quarantine", error: "paper filing (scanned, no text layer)", raw: m }, { onConflict: "source,external_id" });
        continue;
      }
      if (parsed >= limit) continue;
      parsed++;
      try {
        const rows = parsePtr(await readPdf(url));
        const { data: filing, error: fErr } = await sb.from("filings").insert({
          source: "house", external_id: docId, entity_id: ent.id, url, filed_at: filedAt, raw: { index: m, rows },
          status: rows.length ? "parsed" : "quarantine", error: rows.length ? null : "no rows parsed",
        }).select("id").single();
        if (fErr) throw fErr;
        const trades = rows.map((r, k) => ({
          external_key: `${docId}:${k}`, source: "house", entity_id: ent.id, filing_id: filing.id,
          asset_symbol: r.ticker ?? r.asset.replace(/\s*\[[A-Z]{2}\]\s*$/, "").slice(0, 40), asset_name: r.asset + (r.desc ? ` — ${r.desc}` : ""),
          asset_class: r.code === "OP" || r.desc ? "Option" : CLASS[r.code ?? ""] ?? "Other",
          sector: sectorFor(r.ticker, r.asset),
          side: r.type === "P" ? "buy" : r.type.startsWith("S") ? "sell" : "transfer",
          amount_low: r.low, amount_high: r.high, amount_usd: r.low && r.high ? (r.low + r.high) / 2 : r.low,
          executed_at: `${r.date}T16:00:00Z`, disclosed_at: filedAt, confidence: 3,
          tx_code: r.type, open_market: r.type !== "E",
        }));
        if (trades.length) {
          const { data: ins, error: tErr } = await sb.from("trades").upsert(trades, { onConflict: "source,external_key", ignoreDuplicates: true }).select("id");
          if (tErr) throw tErr;
          itemsNew += ins?.length ?? 0;
        }
      } catch (err) {
        errors.push(`${docId}: ${(err as Error).message}`);
      }
    }
    if (itemsNew) await sb.rpc("relink_trades");
    const backlog = todo.filter((m) => String(m.DocID).startsWith("2")).length - parsed;
    await sb.from("source_runs").update({ finished_at: new Date().toISOString(), status: errors.length ? "partial" : "ok", items_new: itemsNew, error: errors.join("; ") || null }).eq("id", run!.id);
    return Response.json({ ok: true, parsed, itemsNew, backlog, errors });
  } catch (err) {
    await sb.from("source_runs").update({ finished_at: new Date().toISOString(), status: "error", error: (err as Error).message }).eq("id", run!.id);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
