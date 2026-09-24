// Do Tell — Senate Periodic Transaction Reports (efdsearch.senate.gov).
// Runs in GitHub Actions (Senate's CDN blocks most cloud/server IPs, incl. Supabase Edge).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Args: --days=30 --limit=60
import { createClient } from "@supabase/supabase-js";

const arg = (k, d) => Number((process.argv.find((a) => a.startsWith(`--${k}=`)) ?? "").split("=")[1] ?? d) || d;
const DAYS = arg("days", 30), LIMIT = arg("limit", 60);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BASE = "https://efdsearch.senate.gov";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36";
const jar = new Map();
const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
async function req(path, init = {}) {
  const r = await fetch(BASE + path, { redirect: "manual", ...init, headers: { "User-Agent": UA, Cookie: cookie(), Referer: `${BASE}/search/`, ...(init.headers ?? {}) } });
  for (const c of r.headers.getSetCookie?.() ?? []) { const kv = c.split(";")[0]; const i = kv.indexOf("="); jar.set(kv.slice(0, i).trim(), kv.slice(i + 1)); }
  return r;
}
const txt = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const usDate = (s) => { const [m, d, y] = s.trim().split("/"); return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; };
const money = (s) => Number(s.replace(/[^0-9]/g, "")) || null;
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const CLASS = { "Stock": "Equity", "Stock Option": "Option", "Corporate Bond": "Bond", "Municipal Security": "Bond", "Government Security": "Bond",
  "Mutual Fund": "Fund", "Exchange Traded Fund": "Fund", "Cryptocurrency": "Crypto", "Other Securities": "Other" };

const { data: run } = await sb.from("source_runs").insert({ source: "senate" }).select("id").single();
let itemsNew = 0, parsed = 0;
const errors = [];
try {
  const home = await (await req("/search/home/")).text();
  const tok = home.match(/name="csrfmiddlewaretoken" value="([^"]+)"/)?.[1];
  if (!tok) throw new Error("no CSRF token on home page (blocked?)");
  await req("/search/home/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `csrfmiddlewaretoken=${tok}&prohibition_agreement=1` });
  const csrf = jar.get("csrftoken") ?? "";
  const since = new Date(Date.now() - DAYS * 864e5);
  const start = `${String(since.getUTCMonth() + 1).padStart(2, "0")}/${String(since.getUTCDate()).padStart(2, "0")}/${since.getUTCFullYear()} 00:00:00`;
  const reports = [];
  for (let off = 0; ; off += 100) {
    const body = new URLSearchParams({ start: String(off), length: "100", report_types: "[11]", filer_types: "[]", submitted_start_date: start,
      submitted_end_date: "", candidate_state: "", senator_state: "", office_id: "", first_name: "", last_name: "", csrfmiddlewaretoken: csrf });
    const r = await req("/search/report/data/", { method: "POST", headers: { "X-CSRFToken": csrf, "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!r.ok) throw new Error(`search ${r.status}`);
    const d = await r.json();
    reports.push(...d.data);
    if (reports.length >= d.recordsFiltered || !d.data.length) break;
  }
  const items = reports.map((row) => {
    const href = String(row[3]).match(/href="([^"]+)"/)?.[1] ?? "";
    return { first: txt(row[0]), last: txt(row[1]), label: txt(row[2]), href, id: href.split("/").filter(Boolean).pop() ?? "", filed: usDate(txt(row[4])) };
  }).filter((x) => x.id);
  const done = new Set();
  for (let i = 0; i < items.length; i += 200) {
    const { data } = await sb.from("filings").select("external_id").eq("source", "senate").in("external_id", items.slice(i, i + 200).map((x) => x.id));
    (data ?? []).forEach((r) => done.add(r.external_id));
  }
  for (const it of items.filter((x) => !done.has(x.id))) {
    if (parsed >= LIMIT) break;
    const { data: ent, error: eErr } = await sb.from("entities").upsert({
      slug: `senate-${slugify(`${it.first} ${it.last}`)}`, name: `Sen. ${it.first.split(" ")[0]} ${it.last}`.replace(/\s+/g, " "),
      role: `Senate${/Former/i.test(it.label) ? " (former)" : ""}`, tier: 3, kind: "person",
    }, { onConflict: "slug" }).select("id").single();
    if (eErr) { errors.push(`${it.id}: ${eErr.message}`); continue; }
    const url = BASE + it.href, filedAt = `${it.filed}T16:00:00Z`;
    if (it.href.includes("/paper/")) {
      await sb.from("filings").upsert({ source: "senate", external_id: it.id, entity_id: ent.id, url, filed_at: filedAt, status: "quarantine", error: "paper filing (scanned)" }, { onConflict: "source,external_id" });
      continue;
    }
    parsed++;
    try {
      const html = await (await req(it.href)).text();
      const table = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? "";
      const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => txt(c[1])));
      const { data: filing, error: fErr } = await sb.from("filings").insert({
        source: "senate", external_id: it.id, entity_id: ent.id, url, filed_at: filedAt, raw: { rows },
        status: rows.length ? "parsed" : "quarantine", error: rows.length ? null : "no rows parsed",
      }).select("id").single();
      if (fErr) throw fErr;
      const trades = rows.filter((c) => c.length >= 8).map((c, k) => {
        const [, date, owner, tickerRaw, name, type, kind, amount, comment] = c;
        const ticker = /^[A-Z][A-Z0-9.\-]{0,6}$/.test(tickerRaw) ? tickerRaw : null;
        const nums = amount.match(/\$[\d,]+/g) ?? [];
        const lo = nums[0] ? money(nums[0]) : null, hi = /over/i.test(amount) ? null : nums[1] ? money(nums[1]) : null;
        return {
          external_key: `${it.id}:${k}`, source: "senate", entity_id: ent.id, filing_id: filing.id,
          asset_symbol: ticker ?? name.slice(0, 40), asset_name: `${name}${owner ? ` · ${owner}` : ""}${comment && comment !== "--" ? ` — ${comment}` : ""}`,
          asset_class: CLASS[type] ?? "Other", sector: null, // filled by DB trigger from asset_sectors
          side: /^Purchase/i.test(kind) ? "buy" : /^Sale/i.test(kind) ? "sell" : "transfer",
          amount_low: lo, amount_high: hi, amount_usd: lo && hi ? (lo + hi) / 2 : lo,
          executed_at: `${usDate(date)}T16:00:00Z`, disclosed_at: filedAt, confidence: 3,
          tx_code: kind, open_market: !/exchange/i.test(kind) && !/dividend reinvest/i.test(comment ?? ""),
        };
      });
      if (trades.length) {
        const { data: ins, error: tErr } = await sb.from("trades").upsert(trades, { onConflict: "source,external_key", ignoreDuplicates: true }).select("id");
        if (tErr) throw tErr;
        itemsNew += ins?.length ?? 0;
      }
    } catch (err) { errors.push(`${it.id}: ${err.message}`); }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (itemsNew) await sb.rpc("relink_trades");
  await sb.from("source_runs").update({ finished_at: new Date().toISOString(), status: errors.length ? "partial" : "ok", items_new: itemsNew, error: errors.join("; ") || null }).eq("id", run.id);
  console.log(JSON.stringify({ ok: true, reports: items.length, parsed, itemsNew, errors }));
} catch (err) {
  await sb.from("source_runs").update({ finished_at: new Date().toISOString(), status: "error", error: err.message }).eq("id", run.id);
  console.error(err); process.exit(1);
}
