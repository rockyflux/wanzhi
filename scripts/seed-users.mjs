import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
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

const url = env.VITE_SUPABASE_URL
const secret = env.SUPABASE_SECRET_KEY
const password = env.SUPABASE_DB_PASSWORD
if (!url || !secret || !password) {
  console.error('缺少 VITE_SUPABASE_URL / SUPABASE_SECRET_KEY / SUPABASE_DB_PASSWORD')
  process.exit(1)
}

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const users = [
  { username: 'admin', password: 'admin123', nickname: '站点管理员', role: 'admin' },
  { username: 'user', password: 'user123', nickname: '访客', role: 'user' },
]

async function ensureUser(entry) {
  const email = `${entry.username}@wanzi.local`
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (listed.error) throw listed.error
  let found = listed.data.users.find((u) => u.email === email)
  if (!found) {
    const created = await admin.auth.admin.createUser({
      email,
      password: entry.password,
      email_confirm: true,
      user_metadata: { username: entry.username, nickname: entry.nickname },
    })
    if (created.error) throw created.error
    found = created.data.user
    console.log('created', email)
  } else {
    console.log('exists', email)
  }
  return found.id
}

const ids = {}
for (const entry of users) {
  ids[entry.username] = await ensureUser(entry)
}

const ref = url.replace(/^https:\/\//, '').replace(/\.supabase\.co\/?$/, '')
const client = new pg.Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  user: 'postgres',
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})
await client.connect()
try {
  for (const entry of users) {
    await client.query(
      `insert into public.profiles (id, username, nickname, role)
       values ($1, $2, $3, $4)
       on conflict (id) do update set username = excluded.username, nickname = excluded.nickname, role = excluded.role`,
      [ids[entry.username], entry.username, entry.nickname, entry.role],
    )
  }
  console.log('profiles ready')
} finally {
  await client.end()
}
