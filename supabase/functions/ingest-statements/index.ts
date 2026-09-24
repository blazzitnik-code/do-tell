// Do Tell — public statements (Truth Social posts) via Roll Call Factba.se archive (free, a few minutes behind the post).
// • Every post → statements (sector + tickers mentioned).
// • Posts that name a company/token → also a policy event of type social_post (window −3d/+3d) for that ticker's sector.
// • Then link_statements() (statement ↔ event) and relink_trades() (◆ / ◇ flags).
// Query: ?pages=1 (50 posts per page), ?from_page=1, ?link=0 to skip linking (backfill). Auth: x-cron-secret.
import { createClient } from "npm:@supabase/supabase-js@2";
import { classify, tickersIn, TICKER_SECTOR } from "../_shared/sectors.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const API = "https://rollcall.com/wp-json/factbase/v1/twitter?platform=truth%20social&sort=date&sort_order=desc";

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) return new Response("forbidden", { status: 403 });
  const qp = new URL(req.url).searchParams;
  const pages = Number(qp.get("pages") ?? 1), fromPage = Number(qp.get("from_page") ?? 1), link = qp.get("link") !== "0";
  const { data: run } = await sb.from("source_runs").insert({ source: "statements" }).select("id").single();
  try {
    // deno-lint-ignore no-explicit-any
    const posts: any[] = [];
    for (let p = fromPage; p < fromPage + pages; p++) {
      const r = await fetch(`${API}&page=${p}`, { headers: { "User-Agent": "Mozilla/5.0 (Do Tell)" } });
      if (!r.ok) throw new Error(`factbase ${r.status}`);
      posts.push(...((await r.json()).data ?? []));
    }
    const rows = posts.filter((x) => x.text && x.text !== "[Video]" && !x.deleted_flag && !/^RT @/.test(x.text)).map((x) => {
      const body = String(x.text);
      const symbols = tickersIn(body);
      const sector = (symbols.map((t) => TICKER_SECTOR[t]).find(Boolean)) ?? classify(body);
      return {
        source: "factbase", external_id: String(x.id), posted_at: new Date(x.date).toISOString(), channel: "truth_social",
        speaker: x.speaker ?? "Donald Trump", body, url: x.post_url, sector, symbols, ref_symbol: symbols[0] ?? null,
      };
    });
    const { data: ins, error } = await sb.from("statements").upsert(rows, { onConflict: "source,external_id", ignoreDuplicates: true }).select("external_id");
    if (error) throw error;

    // posts naming a company/token become social_post events
    const evRows = rows.filter((r) => r.symbols.length).map((r) => ({
      source: "truth_social", external_id: r.external_id, occurred_at: r.posted_at, event_type: "social_post", subtype: "Truth Social post",
      title: `Post on ${r.symbols.join(", ")}: “${r.body.replace(/\s+/g, " ").slice(0, 110)}${r.body.length > 110 ? "…" : ""}”`,
      sector: r.sector ?? "other", symbols: r.symbols, url: r.url, scheduled: false,
    }));
    if (evRows.length) {
      const { error: eErr } = await sb.from("events").upsert(evRows, { onConflict: "source,external_id", ignoreDuplicates: true });
      if (eErr) throw eErr;
    }
    let linked = null;
    if (link) { linked = (await sb.rpc("link_statements")).data; await sb.rpc("relink_trades"); }
    await sb.from("source_runs").update({ finished_at: new Date().toISOString(), status: "ok", items_new: ins?.length ?? 0 }).eq("id", run!.id);
    return Response.json({ ok: true, fetched: rows.length, itemsNew: ins?.length ?? 0, events: evRows.length, linked });
  } catch (err) {
    await sb.from("source_runs").update({ finished_at: new Date().toISOString(), status: "error", error: (err as Error).message }).eq("id", run!.id);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
