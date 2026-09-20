<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from '../lib/toast'
import AccountNav from '../components/AccountNav.vue'
import BookmarkShell from '../components/BookmarkShell.vue'
import SimplePager from '../components/SimplePager.vue'
import { faviconSrc } from '../lib/exportPack'
import { formatDate, hostOf } from '../lib/tree'
import { useCatalogStore } from '../stores/catalog'
import type { Site, VisitRecord } from '../types'

const catalog = useCatalogStore()
const router = useRouter()
const rows = ref<Array<VisitRecord & { site?: Site }>>([])
const loading = ref(true)
const page = ref(1)
const pageSize = ref(20)

const total = computed(() => rows.value.length)
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

watch([total, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value) || 1)
  if (page.value > maxPage) page.value = maxPage
})

onMounted(async () => {
  try {
    await catalog.loadVisits()
    rows.value = catalog.visitRows()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
})

function when(iso: string) {
  return `${formatDate(iso)} ${new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
}

function onIconError(event: Event) {
  const img = event.target as HTMLImageElement
  img.classList.add('is-fallback')
  img.removeAttribute('src')
}

async function onOpen(site: Site) {
  await catalog.recordVisit(site.id)
  window.open(site.url, '_blank', 'noopener,noreferrer')
}

function goDetail(id: number) {
  void router.push({ name: 'site', params: { id } })
}
</script>

<template>
  <BookmarkShell>
    <div class="bp me-page">
      <div class="main">
        <header class="topbar">
          <div class="admin-head">
            <h1>访问记录</h1>
            <p>{{ loading ? '加载中…' : '仅登录用户登记' }}</p>
          </div>
          <AccountNav />
        </header>
        <div class="content">
          <section class="category-section">
            <div class="section-head">
              <h2 class="section-title">最近打开</h2>
              <span class="section-meta">{{ loading ? '…' : `${total} 条` }}</span>
            </div>
            <p v-if="!loading && !rows.length" class="no-result">还没有访问记录，去专题页打开几个链接试试。</p>
            <template v-else>
              <div class="visit-list">
                <div v-for="row in pagedRows" :key="row.id" class="bookmark-card visit-row">
                  <template v-if="row.site">
                    <a
                      class="bookmark-main"
                      :href="row.site.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      @click.prevent="onOpen(row.site)"
                    >
                      <img
                        class="card-icon"
                        :src="faviconSrc(row.site.url)"
                        alt=""
                        @error="onIconError"
                      />
                      <span class="card-body">
                        <span class="card-title">{{ row.site.title }}</span>
                        <span class="card-host">{{ hostOf(row.site.url) }} · {{ when(row.visitedAt) }}</span>
                      </span>
                    </a>
                    <button type="button" class="visit-detail" @click="goDetail(row.site.id)">详情</button>
                  </template>
                  <div v-else class="bookmark-main">
                    <span class="card-icon is-fallback" aria-hidden="true"></span>
                    <span class="card-body">
                      <span class="card-title">站点 #{{ row.siteId }}</span>
                      <span class="card-host">{{ when(row.visitedAt) }}</span>
                    </span>
                  </div>
                </div>
              </div>
              <div v-if="total > 0" class="pager">
                <SimplePager v-model:page="page" v-model:page-size="pageSize" :total="total" />
              </div>
            </template>
          </section>
        </div>
      </div>
    </div>
  </BookmarkShell>
</template>
