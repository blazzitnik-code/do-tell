"""Load Senate PTR JSON (from scrape) into Supabase via PostgREST. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY."""
import json, os, re, sys, unicodedata, urllib.request
U, K = os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"]
def api(method, path, body=None, prefer="return=representation"):
    req = urllib.request.Request(f"{U}/rest/v1/{path}", method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": K, "Authorization": f"Bearer {K}", "Content-Type": "application/json", "Prefer": prefer})
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read(); return json.loads(t) if t else None
slug = lambda s: re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFD", s.lower()).encode("ascii", "ignore").decode()))
us = lambda s: "%s-%s-%s" % (s.split("/")[2], s.split("/")[0].zfill(2), s.split("/")[1].zfill(2))
money = lambda s: int(re.sub(r"[^0-9]", "", s) or 0) or None
CLASS = {"Stock": "Equity", "Stock Option": "Option", "Corporate Bond": "Bond", "Municipal Security": "Bond", "Government Security": "Bond",
         "Mutual Fund": "Fund", "Exchange Traded Fund": "Fund", "Cryptocurrency": "Crypto", "Other Securities": "Other"}
data = json.load(open(sys.argv[1]))
seen = {r["external_id"] for r in (api("GET", "filings?select=external_id&source=eq.senate") or [])}
new_trades = 0
for it in data:
    if not it["id"] or it["id"] in seen: continue
    ent = api("POST", "entities?on_conflict=slug", [{"slug": "senate-" + slug(f'{it["first"]} {it["last"]}'),
        "name": re.sub(r"\s+", " ", f'Sen. {it["first"].split(" ")[0]} {it["last"]}'), "role": "Senate" + (" (former)" if "Former" in it["label"] else ""),
        "tier": 3, "kind": "person"}], "resolution=merge-duplicates,return=representation")[0]
    url, filed = "https://efdsearch.senate.gov" + it["href"], us(it["filed"]) + "T16:00:00Z"
    rows = it["rows"]
    f = api("POST", "filings", [{"source": "senate", "external_id": it["id"], "entity_id": ent["id"], "url": url, "filed_at": filed,
        "raw": {"rows": rows}, "status": "parsed" if rows else "quarantine", "error": None if rows else ("paper filing (scanned)" if rows is None else "no rows parsed")}])[0]
    trades = []
    for k, c in enumerate(r for r in (rows or []) if len(r) >= 8):
        _, date, owner, tick, name, typ, kind, amount = c[:8]; comment = c[8] if len(c) > 8 else ""
        ticker = tick if re.fullmatch(r"[A-Z][A-Z0-9.\-]{0,6}", tick) else None
        nums = re.findall(r"\$[\d,]+", amount); lo = money(nums[0]) if nums else None
        hi = None if re.search("over", amount, re.I) else (money(nums[1]) if len(nums) > 1 else None)
        trades.append({"external_key": f'{it["id"]}:{k}', "source": "senate", "entity_id": ent["id"], "filing_id": f["id"],
            "asset_symbol": ticker or name[:40], "asset_name": name + (f" · {owner}" if owner else "") + (f" — {comment}" if comment and comment != "--" else ""),
            "asset_class": CLASS.get(typ, "Other"), "sector": None,
            "side": "buy" if kind.startswith("Purchase") else "sell" if kind.startswith("Sale") else "transfer",
            "amount_low": lo, "amount_high": hi, "amount_usd": (lo + hi) / 2 if lo and hi else lo,
            "executed_at": us(date) + "T16:00:00Z", "disclosed_at": filed, "confidence": 3, "tx_code": kind,
            "open_market": not re.search("exchange", kind, re.I) and not re.search("dividend reinvest", comment or "", re.I)})
    if trades:
        ins = api("POST", "trades?on_conflict=source,external_key", trades, "resolution=ignore-duplicates,return=representation")
        new_trades += len(ins or [])
api("POST", "rpc/relink_trades", {})
api("POST", "source_runs", [{"source": "senate", "finished_at": "now()", "status": "ok", "items_new": new_trades}], "return=minimal")
print("new trades", new_trades)
