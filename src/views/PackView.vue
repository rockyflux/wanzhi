<script setup lang="ts">
import { computed, inject, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from '../lib/toast'
import FolderNav from '../components/FolderNav.vue'
import AccountNav from '../components/AccountNav.vue'
import { faviconSrc } from '../lib/exportPack'
import { applyDocumentTheme } from '../lib/theme'
import { categoryBreadcrumb, findCategory, hostOf } from '../lib/tree'
import { useAuthStore } from '../stores/auth'
import { useCatalogStore } from '../stores/catalog'
import type { Category, Site } from '../types'

const props = defineProps<{
  packSlug?: string
}>()

const theme = inject<{ isDark: Ref<boolean>; toggleTheme: () => void } | null>('bm-theme', null)

const route = useRoute()
const router = useRouter()
const catalog = useCatalogStore()
const auth = useAuthStore()

const query = ref('')
const openIds = ref<number[]>([])
const sidebarOpen = ref(false)
const localDark = ref(localStorage.getItem('bm-theme') === 'dark')
const searchHits = ref<Site[]>([])
const searching = ref(false)

const isDark = computed(() => theme?.isDark.value ?? localDark.value)
const slug = computed(() => props.packSlug || String(route.params.slug || ''))
const pack = computed(() => catalog.packs.find((p) => p.slug === slug.value) ?? null)
const tree = computed(() => (pack.value ? catalog.treeOf(pack.value.id) : []))
const filteredTree = computed(() => filterTree(tree.value, query.value.trim().toLowerCase()))
const childFolders = computed(() => catalog.selectedCategory?.children ?? [])
const direct = computed(() => catalog.directSites(catalog.selectedCategoryId))
const crumbs = computed(() =>
  catalog.selectedCategoryId == null
    ? []
    : categoryBreadcrumb(catalog.categories, catalog.selectedCategoryId),
)
const routeCategoryId = computed(() => {
  const raw = route.params.categoryId
  if (raw == null || raw === '') return null
  const id = Number(raw)
  return Number.isFinite(id) ? id : null
})

function expandToCategory(id: number | null) {
  openIds.value =
    id == null ? [] : categoryBreadcrumb(catalog.categories, id).map((c) => c.id)
}

async function applyRouteCategory() {
  const want = routeCategoryId.value
  if (want == null) return
  if (!findCategory(catalog.categories, want)) return
  if (catalog.selectedCategoryId === want) {
    expandToCategory(want)
    return
  }
  await catalog.selectCategory(want)
  expandToCategory(want)
}

watch(
  slug,
  async (value) => {
    if (!value) return
    query.value = ''
    searchHits.value = []
    sidebarOpen.value = false
    try {
      const loaded = await catalog.enterPack(value)
      await applyRouteCategory()
      expandToCategory(catalog.selectedCategoryId)
      if (loaded) document.title = `${loaded.name} · 书签大礼包`
      if (auth.isLoggedIn) await catalog.loadFavorites()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败')
    }
  },
  { immediate: true },
)

watch(routeCategoryId, async (want, prev) => {
  if (want == null || want === prev) return
  if (!slug.value || !pack.value) return
  try {
    await applyRouteCategory()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '加载失败')
  }
})

watch(query, async (value) => {
  const q = value.trim()
  if (!q || !pack.value) {
    searchHits.value = []
    return
  }
  searching.value = true
  try {
    searchHits.value = await catalog.searchSites(pack.value.id, q)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '搜索失败')
  } finally {
    searching.value = false
  }
})

function filterTree(nodes: Category[], q: string): Category[] {
  if (!q) return nodes
  const out: Category[] = []
  for (const node of nodes) {
    const children = filterTree(node.children ?? [], q)
    const self = node.name.toLowerCase().includes(q)
    if (self || children.length) out.push({ ...node, children })
  }
  return out
}

async function select(id: number) {
  await catalog.selectCategory(id)
  const chain = categoryBreadcrumb(catalog.categories, id).map((c) => c.id)
  openIds.value = Array.from(new Set([...openIds.value, ...chain]))
  sidebarOpen.value = false
  query.value = ''
  searchHits.value = []
  if (slug.value) {
    void router.replace({
      name: 'pack-category',
      params: { slug: slug.value, categoryId: String(id) },
    })
  }
}

function shareUrl(): string {
  const id = catalog.selectedCategoryId
  if (!slug.value || id == null) return ''
  const href = router.resolve({
    name: 'pack-category',
    params: { slug: slug.value, categoryId: String(id) },
  }).href
  return new URL(href, window.location.origin).toString()
}

async function shareCategory() {
  const url = shareUrl()
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    toast.success('分类链接已复制')
  } catch {
    toast.error('复制失败，请手动复制地址栏链接')
  }
}

function toggle(id: number) {
  openIds.value = openIds.value.includes(id)
    ? openIds.value.filter((x) => x !== id)
    : [...openIds.value, id]
}

function countOf(id: number) {
  return catalog.countInCategory(id)
}

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
      toast.warning(res.message)
      router.push({ name: 'login', query: { redirect: route.fullPath } })
      return
    }
    toast.success(res.message)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '操作失败')
  }
}

function toggleTheme() {
  if (theme) {
    theme.toggleTheme()
    return
  }
  localDark.value = !localDark.value
  localStorage.setItem('bm-theme', localDark.value ? 'dark' : 'light')
  applyDocumentTheme(localDark.value)
}

function folderOf(site: Site) {
  return findCategory(catalog.categories, site.categoryId)?.name
}
</script>

<template>
  <div v-if="slug && !pack && !catalog.loading" class="bp" :class="{ dark: isDark }">
    <div class="missing">
      没有这个专题。
      <router-link to="/">回首页</router-link>
    </div>
  </div>
  <div v-else class="bp" :class="{ dark: isDark, 'sidebar-open': sidebarOpen }">
    <div class="backdrop" @click="sidebarOpen = false"></div>
    <aside class="sidebar">
      <div class="brand" :title="pack?.name || '专题'">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8 6 6 9.5 6 12.5a6 6 0 0012 0C18 9.5 16 6 12 2zm0 14.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
          </svg>
        </span>
        <span class="brand-title">{{ pack?.name || '加载中…' }}</span>
      </div>
      <nav class="nav-scroll" aria-label="分类导航">
        <FolderNav
          :nodes="filteredTree"
          :selected-id="catalog.selectedCategoryId"
          :open-ids="openIds"
          :force-open="!!query.trim()"
          :count-of="countOf"
          @select="select"
          @toggle="toggle"
        />
      </nav>
    </aside>
    <div class="main">
      <header class="topbar">
        <button type="button" class="menu-toggle" aria-label="打开目录" @click="sidebarOpen = true">
          <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
            <path
              fill-rule="evenodd"
              d="M3 5h14a1 1 0 110 2H3a1 1 0 110-2zm0 4h14a1 1 0 110 2H3a1 1 0 110-2zm0 4h14a1 1 0 110 2H3a1 1 0 110-2z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        <div class="search-wrap">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fill-rule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clip-rule="evenodd"
            />
          </svg>
          <input v-model="query" type="search" placeholder="搜索当前专题" autocomplete="off" />
        </div>
        <AccountNav />
        <button type="button" class="icon-btn" aria-label="切换主题" @click="toggleTheme">
          <svg class="icon-sun" viewBox="0 0 20 20" fill="currentColor">
            <path
              d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
            />
          </svg>
          <svg class="icon-moon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
          </svg>
        </button>
      </header>
      <div class="content">
        <p v-if="catalog.loading" class="excerpt">正在从 Supabase 加载…</p>
        <template v-if="query.trim()">
          <div class="category-section">
            <div class="section-head">
              <h2 class="section-title">搜索「{{ query.trim() }}」</h2>
              <span class="section-meta">{{ searching ? '…' : `${searchHits.length} 个` }}</span>
            </div>
            <p v-if="!searching && !searchHits.length" class="no-result">没有匹配的书签</p>
            <div v-else class="card-grid">
              <div v-for="site in searchHits" :key="site.id" class="bookmark-card">
                <a class="bookmark-main" :href="site.url" target="_blank" rel="noopener noreferrer" @click="onOpen(site)">
                  <img class="card-icon" :src="faviconSrc(site.url)" alt="" @error="onIconError" />
                  <span class="card-body">
                    <span class="card-title">{{ site.title }}</span>
                    <span class="card-host">{{ folderOf(site) }} · {{ hostOf(site.url) }}</span>
                  </span>
                </a>
                <button type="button" class="fav" :class="{ on: catalog.isFavorited(site.id) }" @click="onFav(site)">
                  ★
                </button>
              </div>
            </div>
          </div>
        </template>
        <template v-else-if="catalog.selectedCategory">
          <div class="breadcrumb">
            <div class="breadcrumb-path">
              <span>{{ pack?.name }}</span>
              <template v-for="c in crumbs" :key="c.id">
                <span>/</span>
                <button type="button" @click="select(c.id)">{{ c.name }}</button>
              </template>
            </div>
            <button
              type="button"
              class="breadcrumb-share"
              title="复制分类链接，对方打开即见此列表"
              aria-label="分享当前分类"
              @click="shareCategory"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" aria-hidden="true">
                <path
                  d="M12.586 3.586a2 2 0 112.828 2.828l-4.243 4.243a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l4.243-4.243a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5.95 8.657a2 2 0 010 2.828l-1.5 1.5a2 2 0 11-2.828-2.828l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a4 4 0 105.656 5.656l1.5-1.5a4 4 0 000-5.656 1 1 0 00-1.414 1.414z"
                />
              </svg>
              <span>分享</span>
            </button>
          </div>
          <section class="category-section">
            <div class="section-head">
              <h2 class="section-title">{{ catalog.selectedCategory.name }}</h2>
              <span class="section-meta">{{ countOf(catalog.selectedCategory.id) }} 个链接</span>
            </div>
            <div v-if="childFolders.length" class="folder-grid">
              <button
                v-for="folder in childFolders"
                :key="folder.id"
                type="button"
                class="folder-card"
                @click="select(folder.id)"
              >
                <span class="folder-glyph" aria-hidden="true"></span>
                <span class="folder-label">{{ folder.name }}</span>
              </button>
            </div>
            <div v-if="direct.length" class="section-head">
              <h3 class="section-label">书签</h3>
              <span class="section-meta">{{ direct.length }} 个</span>
            </div>
            <div class="card-grid">
              <div v-for="site in direct" :key="site.id" class="bookmark-card">
                <a class="bookmark-main" :href="site.url" target="_blank" rel="noopener noreferrer" @click="onOpen(site)">
                  <img class="card-icon" :src="faviconSrc(site.url)" alt="" @error="onIconError" />
                  <span class="card-body">
                    <span class="card-title">{{ site.title }}</span>
                    <span class="card-host">{{ hostOf(site.url) }}</span>
                  </span>
                </a>
                <button type="button" class="fav" :class="{ on: catalog.isFavorited(site.id) }" @click="onFav(site)">
                  ★
                </button>
              </div>
            </div>
            <p v-if="!childFolders.length && !direct.length" class="no-result">这个文件夹里还没有链接</p>
          </section>
        </template>
        <p v-else-if="!catalog.loading" class="no-result">这个专题还没有文件夹。管理里可以导入书签 HTML。</p>
      </div>
    </div>
  </div>
</template>
