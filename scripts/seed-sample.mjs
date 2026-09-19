import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
}

const ref = env.VITE_SUPABASE_URL.replace(/^https:\/\//, '').replace(/\.supabase\.co\/?$/, '')
const client = new pg.Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  user: 'postgres',
  password: env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

const samples = [
  {
    slug: 'tools',
    folders: [
      {
        name: '工具箱',
        sites: [
          ['TinyPNG', 'https://tinypng.com'],
          ['Squoosh', 'https://squoosh.app'],
        ],
      },
      {
        name: '文件处理',
        children: [
          {
            name: '万能转换',
            children: [
              {
                name: 'PDF转换',
                sites: [
                  ['iLovePDF', 'https://www.ilovepdf.com'],
                  ['Smallpdf', 'https://smallpdf.com'],
                ],
              },
              {
                name: '图片转换',
                sites: [['CloudConvert', 'https://cloudconvert.com']],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'work',
    folders: [
      {
        name: '中国国家官方网站',
        sites: [
          ['中国裁判文书网', 'https://wenshu.court.gov.cn/'],
          ['国家企业信用信息公示系统', 'http://www.gsxt.gov.cn/'],
          ['国家法律法规数据库', 'https://flk.npc.gov.cn/'],
        ],
      },
      {
        name: '各行各业',
        children: [
          {
            name: '自媒体',
            children: [
              {
                name: '创作平台',
                sites: [
                  ['微信公众平台', 'https://mp.weixin.qq.com/'],
                  ['哔哩哔哩创作中心', 'https://member.bilibili.com/'],
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

async function insertFolder(packId, parentId, folder) {
  const { rows } = await client.query(
    `insert into public.category (pack_id, parent_id, name, sort_order)
     values ($1, $2, $3, $4)
     returning id`,
    [packId, parentId, folder.name, 0],
  )
  const id = rows[0].id
  let sort = 0
  for (const [title, url] of folder.sites ?? []) {
    await client.query(
      `insert into public.site (pack_id, category_id, title, url, host, status, sort_order)
       values ($1, $2, $3, $4, $5, 'PUBLISHED', $6)`,
      [packId, id, title, url, hostOf(url), sort++],
    )
  }
  for (const child of folder.children ?? []) {
    await insertFolder(packId, id, child)
  }
}

await client.connect()
try {
  for (const sample of samples) {
    const pack = await client.query(`select id from public.pack where slug = $1`, [sample.slug])
    if (!pack.rows[0]) continue
    const packId = pack.rows[0].id
    const existing = await client.query(
      `select count(*)::int as n from public.site where pack_id = $1`,
      [packId],
    )
    if (existing.rows[0].n > 0) {
      console.log('skip', sample.slug, 'already has sites')
      continue
    }
    for (const folder of sample.folders) await insertFolder(packId, null, folder)
    console.log('seeded', sample.slug)
  }
} finally {
  await client.end()
}
