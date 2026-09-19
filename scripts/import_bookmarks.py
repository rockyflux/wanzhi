#!/usr/bin/env python3
"""将 Bookmarks/packs 下的 Netscape HTML 批量导入 Supabase（直连 Postgres）。

解析逻辑对齐 Bookmarks/tools/to_html.py：事件栈、separator.site 提升子分类、
跳过书签栏外壳、剥掉单层空壳包装。分类与静态站一致。

用法:
  python scripts/import_bookmarks.py              # 导入全部专题（覆盖）
  python scripts/import_bookmarks.py --dry-run    # 只解析统计，不写库
  python scripts/import_bookmarks.py --only tools,work
  python scripts/import_bookmarks.py --no-replace # 不清空已有数据（按 URL 去重）

Bookmarks 仓库根目录（其下要有 packs/）按顺序取：
  --bookmarks-root、环境变量 BOOKMARKS_DIR、scripts/bookmarks.local
"""

from __future__ import annotations

import argparse
import html as html_lib
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
from psycopg2.extras import Json, execute_values

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env.local"
LOCAL_BOOKMARKS = ROOT / "scripts" / "bookmarks.local"

# slug → 源 HTML（相对 packs/）。无知用最新整理版，不用旧的 2 万+ KB 备份。
PACK_SOURCES: list[tuple[str, str]] = [
    ("wuzhi", r"无知资源书签\无知书签_20260903.html"),
    ("cheese", r"奶酪书签\奶酪书签.html"),
    ("software", r"软件\软件.html"),
    ("entertainment", r"娱乐休闲\娱乐休闲.html"),
    ("study", r"学习\学习.html"),
    ("tools", r"在线工具\在线工具.html"),
    ("cloud", r"云盘磁力\云盘磁力.html"),
    ("work", r"工作\工作.html"),
    ("design", r"在线设计\在线设计.html"),
    ("office", r"在线办公\在线办公.html"),
    ("academic", r"文库学术\文库学术.html"),
    ("explore", r"资源探索\资源探索.html"),
]

SKIP_TITLES = {
    "bookmarks",
    "bookmarks bar",
    "收藏夹",
    "收藏栏",
    "书签栏",
    "收藏夹栏",
    "其他书签",
    "other bookmarks",
    "mobile bookmarks",
    "从html文件导入",
    "从 html 文件导入",
}

SITE_BATCH = 2000


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        t = line.strip()
        if not t or t.startswith("#") or "=" not in t:
            continue
        k, v = t.split("=", 1)
        env[k] = v
    return env


def db_connect():
    env = load_env(ENV_FILE)
    url = env.get("VITE_SUPABASE_URL", "")
    password = env.get("SUPABASE_DB_PASSWORD", "")
    ref = re.sub(r"^https://", "", url)
    ref = re.sub(r"\.supabase\.co/?$", "", ref)
    if not ref or not password:
        raise SystemExit(".env.local 缺少 VITE_SUPABASE_URL 或 SUPABASE_DB_PASSWORD")
    return psycopg2.connect(
        host=f"db.{ref}.supabase.co",
        port=5432,
        user="postgres",
        password=password,
        dbname="postgres",
        sslmode="require",
    )


def plain(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text or "")
    return html_lib.unescape(text).strip()


def separator_host(href: str) -> str:
    if not href:
        return ""
    try:
        return (urlparse(href).netloc or "").lower()
    except Exception:
        return ""


def separator_kind(href: str) -> str | None:
    host = separator_host(href)
    if not host:
        return None
    if host == "separator.site" or host.endswith(".separator.site"):
        return "folder"
    if host == "separator.mayastudios.com" or host.startswith("separator."):
        return "inline"
    return None


def is_folder_separator(href: str) -> bool:
    return separator_kind(href) == "folder"


def separator_title(text: str) -> str:
    return re.sub(
        r"^[\s\-_=═─—–―－]+|[\s\-_=═─—–―－]+$",
        "",
        text or "",
    ).strip()


def host_of(url: str) -> str:
    if not url or url.startswith(("javascript:", "data:", "about:")):
        return ""
    try:
        return (urlparse(url).hostname or "").removeprefix("www.")
    except Exception:
        return ""


def parse_bookmark_tree(html_content: str) -> list[dict]:
    """返回一级分类树：[{title, children, links}]，links 为 {text,href}。"""
    events = []
    for m in re.finditer(
        r"<DL\b[^>]*>|</DL>|<DT>\s*<H3\b[^>]*>.*?</H3>|<DT>\s*<A\s+[^>]*>.*?</A>",
        html_content,
        re.I | re.S,
    ):
        s = m.group(0)
        if re.match(r"<DL\b", s, re.I):
            events.append(("dl_open",))
        elif re.match(r"</DL>", s, re.I):
            events.append(("dl_close",))
        elif re.match(r"<DT>\s*<H3", s, re.I):
            title = plain(re.search(r"<H3\b[^>]*>(.*?)</H3>", s, re.I | re.S).group(1))
            events.append(("folder", title))
        else:
            am = re.search(r"<A\s+([^>]*)>(.*?)</A>", s, re.I | re.S)
            attrs, text = am.group(1), plain(am.group(2))
            href_m = re.search(r'HREF\s*=\s*"([^"]*)"', attrs, re.I)
            href = href_m.group(1) if href_m else ""
            events.append(("link", text, href))

    root = {"title": "root", "items": []}
    stack = [root]
    i = 0
    while i < len(events):
        e = events[i]
        if e[0] == "folder":
            node = {"title": e[1], "items": []}
            stack[-1]["items"].append(("folder", node))
            if i + 1 < len(events) and events[i + 1][0] == "dl_open":
                stack.append(node)
                i += 2
                continue
            i += 1
        elif e[0] == "dl_open":
            i += 1
        elif e[0] == "dl_close":
            if len(stack) > 1:
                stack.pop()
            i += 1
        else:
            text, href = e[1], e[2]
            if href and text:
                stack[-1]["items"].append(("link", {"text": text, "href": href}))
            i += 1

    def expand_separators(node):
        items = node.get("items") or []
        for kind, payload in items:
            if kind == "folder":
                expand_separators(payload)

        out = []
        i = 0
        while i < len(items):
            kind, payload = items[i]
            if kind == "link" and is_folder_separator(payload["href"]):
                title = separator_title(payload["text"])
                i += 1
                if not title:
                    continue
                group_items = []
                while i < len(items):
                    k2, p2 = items[i]
                    if k2 == "link" and is_folder_separator(p2["href"]):
                        if separator_title(p2["text"]):
                            break
                        i += 1
                        continue
                    group_items.append(items[i])
                    i += 1
                if not group_items:
                    continue
                group = {"title": title, "items": group_items}
                expand_separators(group)
                out.append(("folder", group))
            else:
                out.append(items[i])
                i += 1
        node["items"] = out

    def materialize(node):
        children, links = [], []
        for kind, payload in node.get("items") or []:
            if kind == "folder":
                materialize(payload)
                children.append(payload)
            elif kind == "link":
                sk = separator_kind(payload["href"])
                if sk == "folder":
                    continue
                if sk == "inline":
                    continue  # 分组标题不当作网址入库
                links.append(payload)
        node["children"] = children
        node["links"] = links

    expand_separators(root)
    materialize(root)

    def unwrap_skip(nodes):
        result = []
        for n in nodes:
            if n["title"].lower() in SKIP_TITLES:
                result.extend(unwrap_skip(n["children"]) if n["children"] else [])
                if n["links"]:
                    result.append(
                        {
                            "title": n["title"] or "未分类",
                            "children": [],
                            "links": n["links"],
                        }
                    )
            else:
                result.append(n)
        return result

    tree = unwrap_skip(root["children"])
    while len(tree) == 1 and tree[0]["children"] and not tree[0]["links"]:
        tree = tree[0]["children"]

    # 全局去重（title, href），与静态站一致
    seen: set[tuple[str, str]] = set()

    def dedupe(nodes):
        for n in nodes:
            kept = []
            for link in n["links"]:
                key = (link["text"], link["href"])
                if key in seen:
                    continue
                seen.add(key)
                kept.append(link)
            n["links"] = kept
            dedupe(n["children"])

    dedupe(tree)
    return tree


def count_tree(tree: list[dict]) -> tuple[int, int]:
    cats = 0
    sites = 0

    def walk(nodes):
        nonlocal cats, sites
        for n in nodes:
            cats += 1
            sites += len(n["links"])
            walk(n["children"])

    walk(tree)
    return cats, sites


def flatten_for_insert(tree: list[dict]):
    """产出 categories 按插入顺序（父先于子），以及 sites 引用 category 临时 key。"""
    categories: list[dict] = []  # {key, parent_key, name, sort_order}
    sites: list[dict] = []  # {cat_key, title, url, host, sort_order}
    counter = 0

    def walk(nodes, parent_key: str | None):
        nonlocal counter
        for sort_order, n in enumerate(nodes):
            counter += 1
            key = f"c{counter}"
            categories.append(
                {
                    "key": key,
                    "parent_key": parent_key,
                    "name": n["title"] or "未命名",
                    "sort_order": sort_order,
                }
            )
            for si, link in enumerate(n["links"]):
                href = link["href"]
                if not href or href.lower().startswith("javascript:"):
                    continue
                sites.append(
                    {
                        "cat_key": key,
                        "title": (link["text"] or href)[:500],
                        "url": href[:2000],
                        "host": host_of(href)[:255],
                        "sort_order": si,
                    }
                )
            walk(n["children"], key)

    walk(tree, None)
    return categories, sites


def import_pack(
    cur,
    pack_id: int,
    slug: str,
    filename: str,
    tree: list[dict],
    *,
    replace: bool,
) -> dict:
    notes: list[str] = []
    skipped = 0
    failed = 0

    if replace:
        cur.execute("delete from public.site where pack_id = %s", (pack_id,))
        cur.execute("delete from public.category where pack_id = %s", (pack_id,))
        notes.append("已清空该专题原有分类与链接")

    categories, sites = flatten_for_insert(tree)
    key_to_id: dict[str, int] = {}

    # 按层批量插入分类（同层无父子依赖）
    remaining = list(categories)
    while remaining:
        ready = [c for c in remaining if c["parent_key"] is None or c["parent_key"] in key_to_id]
        if not ready:
            raise RuntimeError(f"{slug}: 分类树存在环或孤儿节点")
        ready_set = {c["key"] for c in ready}
        remaining = [c for c in remaining if c["key"] not in ready_set]

        rows = [
            (
                pack_id,
                key_to_id[c["parent_key"]] if c["parent_key"] else None,
                c["name"][:200],
                c["sort_order"],
                c["key"],
            )
            for c in ready
        ]
        # 临时用 description? 没有。用 returning + 按插入顺序对齐：execute_values 顺序稳定
        returned = execute_values(
            cur,
            """
            insert into public.category (pack_id, parent_id, name, sort_order)
            values %s
            returning id
            """,
            [(r[0], r[1], r[2], r[3]) for r in rows],
            page_size=500,
            fetch=True,
        )
        for (cat_id,), meta in zip(returned, rows):
            key_to_id[meta[4]] = cat_id

    # 重算 path / level（避免 BEFORE INSERT 时偶发 path 未填）
    cur.execute(
        """
        with recursive t as (
          select id, parent_id, ('/' || id::text || '/') as path, 1 as level
          from public.category
          where pack_id = %s and parent_id is null
          union all
          select c.id, c.parent_id, t.path || c.id::text || '/', t.level + 1
          from public.category c
          join t on c.parent_id = t.id
        )
        update public.category c
        set path = t.path, level = t.level
        from t
        where c.id = t.id
        """,
        (pack_id,),
    )

    existing: set[str] = set()
    if not replace:
        cur.execute("select url from public.site where pack_id = %s", (pack_id,))
        existing = {r[0].rstrip("/") for r in cur.fetchall()}

    rows = []
    for s in sites:
        norm = s["url"].rstrip("/")
        if norm in existing:
            skipped += 1
            continue
        existing.add(norm)
        cat_id = key_to_id.get(s["cat_key"])
        if cat_id is None:
            failed += 1
            continue
        rows.append(
            (
                pack_id,
                cat_id,
                s["title"],
                s["url"],
                s["host"],
                "PUBLISHED",
                s["sort_order"],
            )
        )

    for i in range(0, len(rows), SITE_BATCH):
        chunk = rows[i : i + SITE_BATCH]
        execute_values(
            cur,
            """
            insert into public.site
              (pack_id, category_id, title, url, host, status, sort_order)
            values %s
            """,
            chunk,
            page_size=SITE_BATCH,
        )

    created_sites = len(rows)
    created_cats = len(categories)
    status = "FAILED" if failed and not created_sites else "PARTIAL" if failed else "SUCCESS"
    if skipped:
        notes.append(f"同专题内按 URL 去重跳过 {skipped} 条")
    cur.execute(
        """
        insert into public.bookmark_import
          (pack_id, filename, status, created_categories, created_sites, skipped, failed, notes)
        values (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        """,
        (
            pack_id,
            filename,
            status,
            created_cats,
            created_sites,
            skipped,
            failed,
            Json(notes),
        ),
    )
    return {
        "slug": slug,
        "categories": created_cats,
        "sites": created_sites,
        "skipped": skipped,
        "failed": failed,
        "status": status,
    }


def resolve_bookmarks_root(explicit: str | None) -> Path:
    if explicit and explicit.strip():
        return Path(explicit.strip())
    env = os.environ.get("BOOKMARKS_DIR", "").strip()
    if env:
        return Path(env)
    if LOCAL_BOOKMARKS.is_file():
        for line in LOCAL_BOOKMARKS.read_text(encoding="utf-8-sig").splitlines():
            text = line.strip()
            if text and not text.startswith("#"):
                return Path(text)
    raise SystemExit(
        "未指定 Bookmarks 仓库根目录。请使用 --bookmarks-root，"
        "或设置环境变量 BOOKMARKS_DIR，"
        "或把路径写在 scripts/bookmarks.local（一行，已被 git 忽略）。"
        "示例见 scripts/bookmarks.local.example。"
    )


def main():
    ap = argparse.ArgumentParser(description="导入 Bookmarks packs → Supabase")
    ap.add_argument("--dry-run", action="store_true", help="只解析统计")
    ap.add_argument("--only", type=str, default="", help="逗号分隔 slug，如 tools,wuzhi")
    ap.add_argument("--no-replace", action="store_true", help="不清空专题，按 URL 去重追加")
    ap.add_argument(
        "--bookmarks-root",
        type=str,
        default=None,
        help="Bookmarks 仓库根目录（其下要有 packs/）。也可设 BOOKMARKS_DIR 或 scripts/bookmarks.local",
    )
    args = ap.parse_args()
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    replace = not args.no_replace
    bookmarks_root = resolve_bookmarks_root(args.bookmarks_root)
    packs_dir = bookmarks_root / "packs"

    jobs = []
    for slug, rel in PACK_SOURCES:
        if only and slug not in only:
            continue
        path = packs_dir / rel
        if not path.is_file():
            print(f"[MISS] {slug}: {path}")
            continue
        jobs.append((slug, path))

    if not jobs:
        raise SystemExit("没有可导入的文件")

    print(f"共 {len(jobs)} 个专题，replace={replace}，dry_run={args.dry_run}")
    parsed: list[tuple[str, Path, list[dict], int, int]] = []
    for slug, path in jobs:
        t0 = time.time()
        html = path.read_text(encoding="utf-8", errors="replace")
        tree = parse_bookmark_tree(html)
        cats, sites = count_tree(tree)
        print(f"  parse {slug}: {cats} 分类, {sites} 链接 ({time.time()-t0:.1f}s) ← {path.name}")
        parsed.append((slug, path, tree, cats, sites))

    total_sites = sum(x[4] for x in parsed)
    total_cats = sum(x[3] for x in parsed)
    print(f"合计: {total_cats} 分类, {total_sites} 链接")
    if args.dry_run:
        return

    conn = db_connect()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute("select id, slug from public.pack")
            pack_ids = {r[1]: r[0] for r in cur.fetchall()}
            results = []
            for slug, path, tree, _, _ in parsed:
                pack_id = pack_ids.get(slug)
                if not pack_id:
                    print(f"[SKIP] pack 不存在: {slug}")
                    continue
                t0 = time.time()
                r = import_pack(
                    cur,
                    pack_id,
                    slug,
                    path.name,
                    tree,
                    replace=replace,
                )
                conn.commit()
                print(
                    f"  ok {slug}: +{r['categories']} 分类 +{r['sites']} 链接 "
                    f"skip={r['skipped']} fail={r['failed']} ({time.time()-t0:.1f}s) [{r['status']}]"
                )
                results.append(r)

            print("\n库内统计:")
            cur.execute("select id, slug from public.pack order by sort_order")
            for pack_id, slug in cur.fetchall():
                cur.execute(
                    "select count(*)::int from public.category where pack_id = %s",
                    (pack_id,),
                )
                cats = cur.fetchone()[0]
                cur.execute(
                    "select count(*)::int from public.site where pack_id = %s",
                    (pack_id,),
                )
                sites = cur.fetchone()[0]
                print(f"  {slug:16} cats={cats:5} sites={sites:6}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    # Windows 控制台 UTF-8
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
