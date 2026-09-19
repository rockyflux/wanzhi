<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AuthGate from '../components/AuthGate.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const username = ref('')
const password = ref('')
const nickname = ref('')
const showPassword = ref(false)
const pending = ref(false)

async function submit() {
  pending.value = true
  try {
    const res = await auth.register(username.value, password.value, nickname.value)
    if (!res.ok) {
      ElMessage.error(res.message)
      return
    }
    ElMessage.success(res.message)
    await router.replace('/')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <AuthGate title="注册" subtitle="创建账号后即可收藏站点、查看访问记录。">
    <form class="auth-form" @submit.prevent="submit">
      <label class="auth-field">
        <span>用户名</span>
        <input
          v-model="username"
          type="text"
          name="username"
          autocomplete="username"
          placeholder="用于登录"
          :disabled="pending"
        />
      </label>
      <label class="auth-field">
        <span>昵称 <em>可选</em></span>
        <input
          v-model="nickname"
          type="text"
          name="nickname"
          autocomplete="nickname"
          placeholder="展示名称"
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
            autocomplete="new-password"
            placeholder="设置密码"
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
        {{ pending ? '注册中…' : '注册并登录' }}
      </button>
    </form>
    <p class="auth-switch">
      已有账号？
      <router-link to="/login">登录</router-link>
    </p>
  </AuthGate>
</template>
