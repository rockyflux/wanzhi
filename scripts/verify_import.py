#!/usr/bin/env python3
import re
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parents[1]
env = {}
for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
    t = line.strip()
    if not t or t.startswith("#") or "=" not in t:
        continue
    k, v = t.split("=", 1)
    env[k] = v
ref = re.sub(r"^https://", "", env["VITE_SUPABASE_URL"])
ref = re.sub(r"\.supabase\.co/?$", "", ref)
conn = psycopg2.connect(
    host=f"db.{ref}.supabase.co",
    port=5432,
    user="postgres",
    password=env["SUPABASE_DB_PASSWORD"],
    dbname="postgres",
    sslmode="require",
)
cur = conn.cursor()
cur.execute("select id, slug from pack order by sort_order")
packs = cur.fetchall()
tc = ts = 0
for pid, slug in packs:
    cur.execute("select count(*) from category where pack_id=%s", (pid,))
    cats = cur.fetchone()[0]
    cur.execute("select count(*) from site where pack_id=%s", (pid,))
    sites = cur.fetchone()[0]
    tc += cats
    ts += sites
    print(f"{slug:16} cats={cats:5} sites={sites:6}")
print(f"TOTAL            cats={tc:5} sites={ts:6}")

cur.execute(
    """
    select name from category
    where pack_id=(select id from pack where slug='tools') and parent_id is null
    order by sort_order limit 12
    """
)
print("tools L1:", " | ".join(r[0] for r in cur.fetchall()))

cur.execute(
    """
    select name from category
    where pack_id=(select id from pack where slug='wuzhi') and parent_id is null
    order by sort_order limit 8
    """
)
print("wuzhi L1:", " | ".join(r[0] for r in cur.fetchall()))

cur.execute(
    "select count(*) from category where path='/' or path is null or path=''"
)
print("bad path:", cur.fetchone()[0])

cur.execute(
    """
    select c.name, count(*)::int
    from site s
    join category c on c.id=s.category_id
    where s.pack_id=(select id from pack where slug='tools')
    group by c.name
    order by count(*) desc
    limit 5
    """
)
print("tools top folders by site count:")
for name, n in cur.fetchall():
    print(f"  {name}: {n}")

cur.close()
conn.close()
