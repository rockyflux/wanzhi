# 书签大礼包（Wanzi）

静态站 [Bookmarks](https://github.com/rockyflux/Bookmarks) 的动态版。界面还是专题列表加左侧目录，数据在 **Supabase**。不另起后端。

## 目录

| 路径 | 做什么 |
|------|--------|
| `src/` | Vue 3 + Vite + Pinia。前台样式对齐 Bookmarks，管理页用 Element Plus |
| `scripts/` | 表结构 `schema.sql`、建表 / 种子 / 导入脚本 |

## 启动

```bash
npm install
npm run dev
```

浏览器打开终端里的地址，一般是 `http://localhost:5173`。

把 `.env.example` 复制成 `.env.local` 再填。该文件被 git 忽略，不要提交。

| 变量 | 谁用 |
|------|------|
| `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` | 浏览器。只用 Publishable key |
| `SUPABASE_SECRET_KEY` | `npm run db:seed`（Auth Admin API） |
| `SUPABASE_DB_PASSWORD` | `npm run db:schema`、导入脚本 |

## 数据库

```bash
npm run db:schema   # 执行 scripts/schema.sql
npm run db:seed     # 试用账号 + 示例数据
```

试用账号：`admin` / `admin123`（管理员），`user` / `user123`（普通用户）。登录名会被写成 `用户名@wanzi.local`。

现有专题从 Bookmarks 仓库的 `packs/` 导入。路径用 `--bookmarks-root`、环境变量 `BOOKMARKS_DIR`，或本机文件 `scripts/bookmarks.local`（一行路径，不提交）：

```bash
pip install -r scripts/requirements.txt
python scripts/import_bookmarks.py --dry-run
python scripts/import_bookmarks.py
python scripts/verify_import.py
```

`wuzhi` 有五万级链接。专题页先拿分类树，再按当前文件夹分页拉链接，不要整包 `select *`。

## 谁能做什么

| | 匿名 | 登录用户 | 管理员 |
|--|:----:|:--------:|:------:|
| 首页、专题、搜索、下载 HTML / Markdown | ✓ | ✓ | ✓ |
| 收藏、访问记录 | | ✓ | ✓ |
| 专题 / 分类 / 网址、导入、统计 | | | ✓ |

写权限在 RLS 里，不在前端藏一套。

许可证：MIT，见 [LICENSE](LICENSE)。
