import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.join(root, '.env.local')
const schemaFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql')

function readEnv(file) {
  const env = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return env
}

const env = readEnv(envFile)
const projectUrl = env.VITE_SUPABASE_URL || ''
const ref = projectUrl.replace(/^https:\/\//, '').replace(/\.supabase\.co\/?$/, '')
const password = env.SUPABASE_DB_PASSWORD
if (!ref || !password) {
  console.error('.env.local 缺少项目地址或数据库密码')
  process.exit(1)
}

const sql = fs.readFileSync(schemaFile, 'utf8')
const client = new pg.Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  user: 'postgres',
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

await client.connect()
try {
  await client.query(sql)
  const { rows } = await client.query(
    `select slug, name from public.pack order by sort_order`,
  )
  console.log(`schema applied, packs: ${rows.length}`)
  for (const row of rows) console.log(`- ${row.slug} ${row.name}`)
} finally {
  await client.end()
}
