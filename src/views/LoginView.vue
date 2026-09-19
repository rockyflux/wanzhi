<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AuthGate from '../components/AuthGate.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const pending = ref(false)

async function submit() {
  if (!username.value.trim() || !password.value) {
    ElMessage.warning('请填写用户名和密码')
    return
  }
  pending.value = true
  try {
    const res = await auth.login(username.value, password.value)
    if (!res.ok) {
      ElMessage.error(res.message)
      return
    }
    ElMessage.success(res.message)
    const redirect = (route.query.redirect as string) || '/'
    await router.replace(redirect)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthGate title="登录" subtitle="登录后可收藏站点，并同步访问记录。">
    <form class="auth-form" @submit.prevent="submit">
      <label class="auth-field">
        <span>用户名</span>
        <input
          v-model="username"
          type="text"
          name="username"
          autocomplete="username"
          placeholder="输入用户名"
          :disabled="pending"
        />
      </label>
      <label class="auth-field">
        <span>密码</span>
        <div class="auth-password">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            name="password"
            autocomplete="current-password"
            placeholder="输入密码"
            :disabled="pending"
          />
          <button
            type="button"
            class="auth-eye"
            :aria-label="showPassword ? '隐藏密码' : '显示密码'"
            :disabled="pending"
            @click="showPassword = !showPassword"
          >
            {{ showPassword ? '隐藏' : '显示' }}
          </button>
        </div>
      </label>
      <button class="auth-submit" type="submit" :disabled="pending">
        {{ pending ? '登录中…' : '登录' }}
      </button>
    </form>
    <p class="auth-switch">
      还没有账号？
      <router-link to="/register">注册</router-link>
    </p>
  </AuthGate>
</template>
