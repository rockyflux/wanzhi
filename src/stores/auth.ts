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

function toEmail(value: string) {
  const clean = value.trim().toLowerCase()
  if (clean.includes('@')) return clean
  // 兼容旧试用账号：admin → admin@wanzi.local
  return `${clean}@wanzi.local`
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
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

  async function login(emailInput: string, password: string) {
    const email = toEmail(emailInput)
    if (!emailInput.trim() || !password) {
      return { ok: false, message: '请填写邮箱和密码' }
    }
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

  async function register(emailInput: string, password: string, nickname: string) {
    const email = emailInput.trim().toLowerCase()
    if (!email || !password.trim()) {
      return { ok: false, message: '请填写邮箱和密码' }
    }
    if (!isEmail(email)) {
      return { ok: false, message: '请输入有效的邮箱地址' }
    }
    const nick = nickname.trim() || email.split('@')[0] || '用户'
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: email,
          nickname: nick,
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

  async function changePassword(currentPassword: string, newPassword: string) {
    const next = newPassword.trim()
    if (!currentPassword || !next) {
      return { ok: false, message: '请填写当前密码和新密码' }
    }
    if (next.length < 6) {
      return { ok: false, message: '新密码至少 6 位' }
    }
    if (currentPassword === next) {
      return { ok: false, message: '新密码不能与当前密码相同' }
    }
    if (!user.value) {
      return { ok: false, message: '请先登录' }
    }
    const email = toEmail(user.value.username)
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    })
    if (verifyError) {
      return { ok: false, message: '当前密码不正确' }
    }
    const { error } = await supabase.auth.updateUser({ password: next })
    if (error) return { ok: false, message: error.message }
    return { ok: true, message: '密码已修改' }
  }

  async function adminResetPassword(userId: string, newPassword: string) {
    const next = newPassword.trim()
    if (!next) throw new Error('请填写新密码')
    if (next.length < 6) throw new Error('新密码至少 6 位')
    const { error } = await supabase.rpc('admin_reset_password', {
      p_user_id: userId,
      p_new_password: next,
    })
    if (error) throw error
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
    changePassword,
    adminResetPassword,
    listUsers,
    setUserStatus,
  }
})
