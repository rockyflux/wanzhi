<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const userMark = computed(() => {
  const name = (auth.user?.nickname || auth.user?.username || '用').trim()
  return name.slice(0, 1) || '用'
})

async function logout() {
  await auth.logout()
  void router.push('/')
}
</script>

<template>
  <nav class="account">
    <template v-if="auth.isLoggedIn">
      <div class="account-user" :title="auth.user?.username">
        <span class="account-avatar" aria-hidden="true">{{ userMark }}</span>
        <span class="account-name">{{ auth.user?.nickname || auth.user?.username }}</span>
      </div>
      <router-link to="/me/favorites">收藏</router-link>
      <router-link to="/me/visits">访问</router-link>
      <router-link v-if="auth.isAdmin" to="/admin">管理</router-link>
      <button type="button" @click="logout">退出</button>
    </template>
    <router-link v-else to="/login">登录</router-link>
  </nav>
</template>
