// Do Tell — policy events from the Federal Register (free, no key)
//  • Presidential documents (executive orders, proclamations, memoranda) → event_type executive_order
//  • Significant final rules from agencies → event_type agency_action
// Query: ?days=7 lookback on publication date. Auth: x-cron-secret.
import { createClient } from "npm:@supabase/supabase-js@2";
import { classify } from "../_shared/sectors.ts";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const FR = "https://www.federalregister.gov/api/v1/documents.json";
const FIELDS = ["title", "type", "subtype", "signing_date", "publication_date", "document_number", "html_url", "abstract",
  "executive_order_number", "agencies"].map((f) => `fields[]=${f}`).join("&");

// deno-lint-ignore no-explicit-any
async function pages(query: string): Promise<any[]> {
  const out = [];
  let url: string | null = `${FR}?per_page=200&order=newest&${FIELDS}&${query}`;
  while (url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`FR ${r.status}`);
    const d = await r.json();
    out.push(...(d.results ?? []));
    url = d.next_page_url ?? null;
  }
  return out;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) return new Response("forbidden", { status: 403 });
  const days = Number(new URL(req.url).searchParams.get("days") ?? 7);
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const { data: run } = await sb.from("source_runs").insert({ source: "events_fr" }).select("id").single();
  try {
    const pres = await pages(`conditions[type][]=PRESDOCU&conditions[publication_date][gte]=${since}`);
    const rules = await pages(`conditions[type][]=RULE&conditions[significant]=1&conditions[publication_date][gte]=${since}`);
    // deno-lint-ignore no-explicit-any
    // Drop routine/ceremonial documents; they carry no market signal and create false links.
    const routine = /^(Continuation of (the )?National Emergency|Delegation of Authority|.*\bCorrection\b)|\b(Day|Week|Month|Anniversary|Remembrance|Observance|Honoring|Death of|Flag|Proclamation on the Occasion)\b/i;
    const rows = [...pres, ...rules].filter((d: any) => !routine.test(d.title)).map((d: any) => {
      const isPres = d.type === "Presidential Document";
      const agency = (d.agencies ?? []).map((a: { name?: string }) => a.name).filter(Boolean).join(", ");
      const day = (isPres && d.signing_date) || d.publication_date;
      return {
        source: "federal_register",
        external_id: d.document_number,
        occurred_at: `${day}T16:00:00Z`, // date-only source → noon ET
        title: isPres ? d.title : `${agency ? agency + ": " : ""}${d.title}`,
        event_type: isPres ? "executive_order" : "agency_action",
        subtype: isPres ? (d.subtype ?? "Presidential document") : "Final rule",
        sector: isPres ? classify(`${d.title} ${d.abstract ?? ""}`) : classify(d.title), // agency rules: title only (abstracts over-match)
        url: d.html_url,
        scheduled: false,
      };
    });
    let itemsNew = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error } = await sb.from("events")
        .upsert(rows.slice(i, i + 200), { onConflict: "source,external_id", ignoreDuplicates: true }).select("id");
      if (error) throw error;
      itemsNew += data?.length ?? 0;
    }
    if (itemsNew) await sb.rpc("relink_trades");
    await sb.from("source_runs").update({ finished_at: new Date().toISOString(), status: "ok", items_new: itemsNew }).eq("id", run!.id);
    return Response.json({ ok: true, fetched: rows.length, itemsNew });
  } catch (err) {
    await sb.from("source_runs").update({ finished_at: new Date().toISOString(), status: "error", error: (err as Error).message }).eq("id", run!.id);
    return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
});
