import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_PUBLISHABLE_KEY，请配置 .env.local')
}

/** Browser client. Uses the publishable key only; RLS enforces access. */
export const supabase = createClient(url, key)
