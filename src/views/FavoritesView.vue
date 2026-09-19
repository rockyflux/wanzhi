<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AccountNav from '../components/AccountNav.vue'
import BookmarkShell from '../components/BookmarkShell.vue'
import { faviconSrc } from '../lib/exportPack'
import { hostOf } from '../lib/tree'
import { useCatalogStore } from '../stores/catalog'
import type { Site } from '../types'

const catalog = useCatalogStore()
const route = useRoute()
const router = useRouter()
const sites = ref<Site[]>([])
const loading = ref(true)
const page = ref(1)
const pageSize = ref(20)

const total = computed(() => sites.value.length)
const pagedSites = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return sites.value.slice(start, start + pageSize.value)
})

const packNameOf = computed(() => {
  const map = new Map(catalog.packs.map((p) => [p.id, p.name]))
  return (packId: number) => map.get(packId)
})

watch([total, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value) || 1)
  if (page.value > maxPage) page.value = maxPage
})

onMounted(async () => {
  try {
    if (!catalog.packs.length) await catalog.loadPacks()
    await catalog.loadFavorites()
    sites.value = catalog.favoriteSites()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
})

function onIconError(event: Event) {
  const img = event.target as HTMLImageElement
  img.classList.add('is-fallback')
  img.removeAttribute('src')
}

async function onOpen(site: Site) {
  await catalog.recordVisit(site.id)
}

async function onFav(site: Site) {
  try {
    const res = await catalog.toggleFavorite(site.id)
    if (!res.ok) {
      ElMessage.warning(res.message)
      void router.push({ name: 'login', query: { redirect: route.fullPath } })
      return
    }
    sites.value = catalog.favoriteSites()
    ElMessage.success(res.message)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '操作失败')
  }
}
</script>

<template>
  <BookmarkShell>
    <div class="bp me-page">
      <div class="main">
        <header class="topbar">
          <div class="admin-head">
            <h1>我的收藏</h1>
            <p>{{ loading ? '加载中…' : '仅当前登录用户可见' }}</p>
          </div>
          <AccountNav />
        </header>
        <div class="content">
          <section class="category-section">
            <div class="section-head">
              <h2 class="section-title">收藏夹</h2>
              <span class="section-meta">{{ loading ? '…' : `${total} 个` }}</span>
            </div>
            <p v-if="!loading && !sites.length" class="no-result">还没有收藏。去专题页点星标即可。</p>
            <template v-else>
              <div class="card-grid">
                <div v-for="site in pagedSites" :key="site.id" class="bookmark-card">
                  <a
                    class="bookmark-main"
                    :href="site.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    @click="onOpen(site)"
                  >
                    <img class="card-icon" :src="faviconSrc(site.url)" alt="" @error="onIconError" />
                    <span class="card-body">
                      <span class="card-title">{{ site.title }}</span>
                      <span class="card-host">
                        {{ packNameOf(site.packId) || '专题' }} · {{ hostOf(site.url) }}
                      </span>
                    </span>
                  </a>
                  <button
                    type="button"
                    class="fav on"
                    aria-label="取消收藏"
                    @click="onFav(site)"
                  >
                    ★
                  </button>
                </div>
              </div>
              <div v-if="total > 0" class="pager">
                <el-pagination
                  v-model:current-page="page"
                  v-model:page-size="pageSize"
                  :total="total"
                  :page-sizes="[10, 20, 50, 100]"
                  layout="total, sizes, prev, pager, next, jumper"
                  background
                />
              </div>
            </template>
          </section>
        </div>
      </div>
    </div>
  </BookmarkShell>
</template>
