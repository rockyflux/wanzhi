<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import BookmarkShell from '../../components/BookmarkShell.vue'

const route = useRoute()

const links = [
  { to: '/admin/stats', label: '概览', hint: '数据' },
  { to: '/admin/usage', label: '用量', hint: 'Supabase' },
  { to: '/admin/packs', label: '专题', hint: '列表' },
  { to: '/admin/import', label: '导入', hint: '书签' },
  { to: '/admin/categories', label: '分类', hint: '文件夹' },
  { to: '/admin/sites', label: '网址', hint: '维护' },
  { to: '/admin/users', label: '用户', hint: '账号' },
]

const pageTitle = computed(() => {
  const hit = links.find((item) => route.path === item.to || route.path.startsWith(`${item.to}/`))
  return hit?.label ?? '管理'
})
</script>

<template>
  <BookmarkShell stage-class="hs-stage-admin">
    <div class="bp admin-shell">
      <aside class="sidebar admin-nav" aria-label="管理导航">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M4 5a2 2 0 012-2h5l2 2h5a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm8 3H7v2h5V8zm5 4H7v2h10v-2zm0 4H7v2h10v-2z"
              />
            </svg>
          </span>
          <span class="brand-title">管理台</span>
        </div>
        <nav class="nav-scroll">
          <ul class="nav-list">
            <li v-for="link in links" :key="link.to" class="nav-item" :class="{ 'is-active': route.path === link.to }">
              <div class="nav-row">
                <router-link class="nav-link" :to="link.to">
                  <span class="nav-text">{{ link.label }}</span>
                  <span class="nav-count">{{ link.hint }}</span>
                </router-link>
              </div>
            </li>
          </ul>
        </nav>
        <div class="admin-nav-foot">
          <router-link class="admin-back" to="/">回导航</router-link>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="admin-head">
            <h1>{{ pageTitle }}</h1>
            <p>维护专题、分类与网址</p>
          </div>
        </header>
        <div class="content admin-content">
          <RouterView />
        </div>
      </div>
    </div>
  </BookmarkShell>
</template>
