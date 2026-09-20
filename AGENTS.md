# Agent notes

书签大礼包的动态站。读根目录 [README.md](README.md)。行为以代码为准。

## 边界

- 没有自建 API。浏览器只走 `@supabase/supabase-js`，客户端在 `src/lib/supabase.ts`，只用 Publishable key。权限靠 `scripts/schema.sql` 的 RLS。
- 不要加 Java / Node 服务，不要自建 Session，不要为每个专题再生成静态 HTML。
- 数据单位是专题 `pack`，不是一棵「书签栏」树。slug 沿用短名：`wuzhi` `cheese` `software` `entertainment` `study` `tools` `cloud` `work` `design` `office` `academic` `explore`。
- `wuzhi` 约五万条链接。公开查询先分类树，再按当前文件夹分页。搜索限定当前专题并带上限。禁止把整个专题拉进浏览器。
- 大导入不在浏览器里做。批量入库用 `scripts/import_bookmarks.py`（直连 Postgres）。管理页导入是小文件路径，五万级不要改成前端循环 insert。
- 前台样式在 `src/styles/bookmarks.css`，对齐 Bookmarks。Element Plus 只用于 `/admin`。不要用组件库重画前台。
- 改表只改 `scripts/schema.sql`，语句必须可重复执行（`if not exists`、`add column if not exists`）。然后 `npm run db:schema`。

## 代码落点

| 要改的事 | 先看 |
|----------|------|
| 路由、登录门槛 | `src/router/index.ts`。`meta.auth` / `meta.admin` |
| 登录、角色、封禁 | `src/stores/auth.ts`。角色在 `profiles.role`（`user` / `admin`），不是 JWT 自定义 claim |
| 专题、分类、链接、收藏、访问、管理写入 | `src/stores/catalog.ts` |
| 行映射 | `src/lib/mappers.ts` |
| 分类树工具 | `src/lib/tree.ts` |
| 下载 HTML / Markdown | `src/lib/exportPack.ts` |
| 页面 | `src/views/`，管理页在 `views/admin/` |

注册与登录用邮箱。旧试用账号仍可用短名（会映射为 `短名@wanzi.local`）。

## 密钥

不要读取、打印或提交 `.env.local`。Secret key 和数据库密码只给 `scripts/`。回答里不要复述密钥。

## 命令

都在仓库根目录：

```bash
npm run dev
npm run build
npm run db:schema
npm run db:seed
python scripts/import_bookmarks.py --dry-run
python scripts/import_bookmarks.py --only tools,work
python scripts/verify_import.py
```

导入脚本默认覆盖已有专题数据。不清空时加 `--no-replace`。
