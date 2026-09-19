<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const isBookmark = computed(() => route.matched.some((record) => record.meta.bookmark))

const navActive = computed(() => {
  if (route.path.startsWith('/admin')) return '/admin'
  if (route.path.startsWith('/me/')) return route.path
  return '/'
})

async function logout() {
  await auth.logout()
  router.push('/')
}
</script>

<template>
  <RouterView v-if="isBookmark" />
  <el-container v-else class="app-shell" direction="vertical">
    <el-header class="topbar">
      <router-link to="/" class="brand">万址</router-link>
      <el-menu class="nav" mode="horizontal" router :ellipsis="false" :default-active="navActive">
        <el-menu-item index="/">浏览</el-menu-item>
        <template v-if="auth.isLoggedIn">
          <el-menu-item index="/me/favorites">我的收藏</el-menu-item>
          <el-menu-item index="/me/visits">访问记录</el-menu-item>
          <el-menu-item v-if="auth.isAdmin" index="/admin">管理</el-menu-item>
        </template>
        <template v-else>
          <el-menu-item index="/login">登录</el-menu-item>
          <el-menu-item index="/register">注册</el-menu-item>
        </template>
      </el-menu>
      <div v-if="auth.isLoggedIn" class="user-box">
        <span>{{ auth.user?.nickname }}</span>
        <el-button link type="primary" @click="logout">退出</el-button>
      </div>
    </el-header>
    <el-main>
      <div class="page">
        <RouterView />
      </div>
    </el-main>
  </el-container>
</template>
