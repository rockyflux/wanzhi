import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { supabase } from '../lib/supabase'
import type { ProfileStatus, ProfileUser, Role, User } from '../types'

type ProfileRow = {
  id: string
  username: string | null
  nickname: string | null
  role: 'user' | 'admin'
  status?: ProfileStatus | null
  last_login_at?: string | null
  login_count?: number | null
  created_at?: string
}

function toEmail(username: string) {
  const clean = username.trim().toLowerCase()
  if (clean.includes('@')) return clean
  return `${clean}@wanzi.local`
}

function mapUser(profile: ProfileRow): User {
  const roles: Role[] = profile.role === 'admin' ? ['ADMIN', 'USER'] : ['USER']
  return {
    id: profile.id,
    username: profile.username || profile.nickname || 'user',
    nickname: profile.nickname || profile.username || '用户',
    roles,
  }
}

function mapProfileUser(row: ProfileRow): ProfileUser {
  return {
    id: row.id,
    username: row.username || row.nickname || 'user',
    nickname: row.nickname || row.username || '用户',
    role: row.role,
    status: row.status === 'banned' ? 'banned' : 'active',
    loginCount: row.login_count ?? 0,
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at || '',
  }
}

/** Supabase Auth + profiles.role */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const ready = ref(false)
  let boot: Promise<void> | null = null

  const isLoggedIn = computed(() => !!user.value)
  const isAdmin = computed(() => !!user.value?.roles.includes('ADMIN'))
  const roles = computed<Role[]>(() => user.value?.roles ?? [])

  async function rejectBanned() {
    user.value = null
    await supabase.auth.signOut()
  }

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, nickname, role, status')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw error
    if (!data) {
      user.value = null
      return
    }
    const row = data as ProfileRow
    if (row.status === 'banned') {
      await rejectBanned()
      return
    }
    user.value = mapUser(row)
  }

  async function refreshSession() {
    const { data } = await supabase.auth.getSession()
    if (!data.session?.user) {
      user.value = null
      return
    }
    await loadProfile(data.session.user.id)
  }

  async function touchLogin() {
    const { error } = await supabase.rpc('record_login')
    if (error) throw error
  }

  function init() {
    if (boot) return boot
    boot = (async () => {
      await refreshSession()
      supabase.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) {
          user.value = null
          return
        }
        void loadProfile(session.user.id)
      })
      ready.value = true
    })()
    return boot
  }

  async function login(username: string, password: string) {
    const email = toEmail(username)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, message: error.message }
    const uid = data.user?.id
    if (uid) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', uid)
        .maybeSingle()
      if ((profile as { status?: string } | null)?.status === 'banned') {
        await rejectBanned()
        return { ok: false, message: '账号已被封禁' }
      }
    }
    try {
      await touchLogin()
    } catch {
      // ponytail: login still ok if stats write fails; admin list just lags
    }
    await refreshSession()
    if (!user.value) return { ok: false, message: '登录失败' }
    return { ok: true, message: '登录成功' }
  }

  async function register(username: string, password: string, nickname: string) {
    const name = username.trim()
    if (!name || !password.trim()) {
      return { ok: false, message: '请填写用户名和密码' }
    }
    const email = toEmail(name)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: name,
          nickname: nickname.trim() || name,
        },
      },
    })
    if (error) return { ok: false, message: error.message }
    try {
      await touchLogin()
    } catch {
      // ponytail: same as login — stats are secondary
    }
    await refreshSession()
    return { ok: true, message: '注册成功，已自动登录' }
  }

  async function logout() {
    await supabase.auth.signOut()
    user.value = null
  }

  async function listUsers(): Promise<ProfileUser[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, nickname, role, status, last_login_at, login_count, created_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    return ((data || []) as ProfileRow[]).map(mapProfileUser)
  }

  async function setUserStatus(id: string, status: ProfileStatus) {
    if (user.value?.id === id) {
      throw new Error(status === 'banned' ? '不能封禁自己' : '不能操作自己')
    }
    const { error } = await supabase.from('profiles').update({ status }).eq('id', id)
    if (error) throw error
  }

  return {
    user,
    ready,
    isLoggedIn,
    isAdmin,
    roles,
    init,
    login,
    register,
    logout,
    listUsers,
    setUserStatus,
  }
})
