<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useCatalogStore } from '../../stores/catalog'

const catalog = useCatalogStore()
const loading = ref(true)

const items = computed(() => [
  { label: '专题', value: catalog.stats.packCount, note: '已发布专题', tone: '#ff5a1f' },
  { label: '已发布网址', value: catalog.stats.siteCount, note: '对外可见', tone: '#2a9d8f' },
  { label: '文件夹', value: catalog.stats.categoryCount, note: '全部分类', tone: '#3d5a80' },
  { label: '收藏', value: catalog.stats.favoriteCount, note: '用户收藏', tone: '#6a994e' },
  { label: '访问登记', value: catalog.stats.visitCount, note: '累计打开', tone: '#bc4749' },
  { label: '今日访问', value: catalog.stats.todayVisits, note: '从零点起', tone: '#0077b6' },
])

onMounted(async () => {
  try {
    await catalog.loadStats()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="category-section admin-stats">
    <div class="section-head">
      <h2 class="section-title">数据概览</h2>
      <span class="section-meta">{{ loading ? '加载中…' : '来自 Supabase' }}</span>
    </div>
    <div class="stats-grid" :aria-busy="loading">
      <article v-for="item in items" :key="item.label" class="stat-tile" :style="{ '--tone': item.tone }">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ loading ? '—' : item.value }}</strong>
        <span class="stat-note">{{ item.note }}</span>
      </article>
    </div>
  </section>
</template>
