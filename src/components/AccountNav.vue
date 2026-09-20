<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from '../lib/toast'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const menuOpen = ref(false)
const pwdOpen = ref(false)
const pending = ref(false)
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrent = ref(false)
const showNew = ref(false)

const userMark = computed(() => {
  const name = (auth.user?.nickname || auth.user?.username || '用').trim()
  return name.slice(0, 1) || '用'
})

function closeMenu() {
  menuOpen.value = false
}

function toggleMenu() {
  menuOpen.value = !menuOpen.value
}

function openChangePassword() {
  closeMenu()
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  showCurrent.value = false
  showNew.value = false
  pwdOpen.value = true
}

function closeChangePassword() {
  if (pending.value) return
  pwdOpen.value = false
}

async function submitPassword() {
  if (newPassword.value !== confirmPassword.value) {
    toast.warning('两次输入的新密码不一致')
    return
  }
  pending.value = true
  try {
    const res = await auth.changePassword(currentPassword.value, newPassword.value)
    if (!res.ok) {
      toast.error(res.message)
      return
    }
    toast.success(res.message)
    pwdOpen.value = false
  } finally {
    pending.value = false
  }
}

async function logout() {
  closeMenu()
  await auth.logout()
  void router.push('/')
}

function onDocClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.account-menu')) closeMenu()
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeMenu()
    closeChangePassword()
  }
}

onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <nav class="account">
    <template v-if="auth.isLoggedIn">
      <div class="account-menu" @click.stop>
        <button
          type="button"
          class="account-user"
          :title="auth.user?.username"
          :aria-expanded="menuOpen"
          aria-haspopup="menu"
          @click="toggleMenu"
        >
          <span class="account-avatar" aria-hidden="true">{{ userMark }}</span>
          <span class="account-name">{{ auth.user?.nickname || auth.user?.username }}</span>
          <svg
            class="account-caret"
            :class="{ open: menuOpen }"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            width="14"
            height="14"
          >
            <path
              fill-rule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        <div v-if="menuOpen" class="account-dropdown" role="menu">
          <router-link role="menuitem" to="/me/favorites" @click="closeMenu">我的收藏</router-link>
          <router-link role="menuitem" to="/me/visits" @click="closeMenu">浏览记录</router-link>
          <router-link v-if="auth.isAdmin" role="menuitem" to="/admin" @click="closeMenu">后台管理</router-link>
          <div class="account-dropdown-sep" role="separator" />
          <button type="button" role="menuitem" @click="openChangePassword">修改密码</button>
          <button type="button" role="menuitem" @click="logout">退出</button>
        </div>
      </div>
    </template>
    <router-link v-else to="/login">登录</router-link>
  </nav>

  <Teleport to="body">
    <div
      v-if="pwdOpen"
      class="account-pwd-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-pwd-title"
      @click.self="closeChangePassword"
    >
      <form class="account-pwd-panel" @submit.prevent="submitPassword">
        <h2 id="account-pwd-title">修改密码</h2>
        <p class="account-pwd-hint">验证当前密码后设置新密码。</p>
        <label class="account-pwd-field">
          <span>当前密码</span>
          <div class="account-pwd-input">
            <input
              v-model="currentPassword"
              :type="showCurrent ? 'text' : 'password'"
              name="current-password"
              autocomplete="current-password"
              placeholder="输入当前密码"
              :disabled="pending"
            />
            <button
              type="button"
              class="account-pwd-eye"
              :aria-label="showCurrent ? '隐藏密码' : '显示密码'"
              :disabled="pending"
              @click="showCurrent = !showCurrent"
            >
              {{ showCurrent ? '隐藏' : '显示' }}
            </button>
          </div>
        </label>
        <label class="account-pwd-field">
          <span>新密码</span>
          <div class="account-pwd-input">
            <input
              v-model="newPassword"
              :type="showNew ? 'text' : 'password'"
              name="new-password"
              autocomplete="new-password"
              placeholder="至少 6 位"
              :disabled="pending"
            />
            <button
              type="button"
              class="account-pwd-eye"
              :aria-label="showNew ? '隐藏密码' : '显示密码'"
              :disabled="pending"
              @click="showNew = !showNew"
            >
              {{ showNew ? '隐藏' : '显示' }}
            </button>
          </div>
        </label>
        <label class="account-pwd-field">
          <span>确认新密码</span>
          <input
            v-model="confirmPassword"
            type="password"
            name="confirm-password"
            autocomplete="new-password"
            placeholder="再输入一次"
            :disabled="pending"
          />
        </label>
        <div class="account-pwd-actions">
          <button type="button" class="account-pwd-cancel" :disabled="pending" @click="closeChangePassword">
            取消
          </button>
          <button type="submit" class="account-pwd-submit" :disabled="pending">
            {{ pending ? '保存中…' : '保存' }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
