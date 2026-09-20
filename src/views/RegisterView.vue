<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from '../lib/toast'
import AuthGate from '../components/AuthGate.vue'
import { useAuthStore } from '../stores/auth'

const ADJECTIVES = [
  '清风',
  '落日',
  '星河',
  '暖阳',
  '青柠',
  '薄雾',
  '远山',
  '微雨',
  '拾光',
  '听风',
  '浅夏',
  '晚风',
]
const NOUNS = [
  '旅人',
  '书签',
  '松鼠',
  '海豚',
  '云雀',
  '墨客',
  '行者',
  '漫游者',
  '收藏家',
  '拾荒人',
  '灯塔',
  '渡口',
]

function randomNickname() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  const num = Math.floor(Math.random() * 90) + 10
  return `${a}${n}${num}`
}

const auth = useAuthStore()
const router = useRouter()
const email = ref('')
const password = ref('')
const nickname = ref('')
const showPassword = ref(false)
const pending = ref(false)

function rollNickname() {
  nickname.value = randomNickname()
}

async function submit() {
  pending.value = true
  try {
    const res = await auth.register(email.value, password.value, nickname.value)
    if (!res.ok) {
      toast.error(res.message)
      return
    }
    toast.success(res.message)
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
        <span>邮箱</span>
        <input
          v-model="email"
          type="email"
          name="email"
          autocomplete="email"
          inputmode="email"
          placeholder="you@example.com"
          :disabled="pending"
        />
      </label>
      <label class="auth-field">
        <span>昵称 <em>可选</em></span>
        <div class="auth-password">
          <input
            v-model="nickname"
            type="text"
            name="nickname"
            autocomplete="nickname"
            placeholder="展示名称"
            :disabled="pending"
          />
          <button
            type="button"
            class="auth-eye"
            aria-label="随机生成昵称"
            :disabled="pending"
            @click="rollNickname"
          >
            随机
          </button>
        </div>
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
