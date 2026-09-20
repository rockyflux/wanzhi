<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AccountNav from '../components/AccountNav.vue'
import BookmarkShell from '../components/BookmarkShell.vue'
import { mapSite, type SiteRow } from '../lib/mappers'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { categoryBreadcrumb, formatDate, hostOf } from '../lib/tree'
import { useAuthStore } from '../stores/auth'
import { useCatalogStore } from '../stores/catalog'
import type { Site } from '../types'

const props = defineProps<{ id: string }>()
const catalog = useCatalogStore()
const auth = useAuthStore()
const router = useRouter()
const remote = ref<Site | null>(null)
const loading = ref(true)

const site = computed(() => catalog.getSite(Number(props.id)) ?? remote.value)
const pack = computed(() => (site.value ? catalog.packById(site.value.packId) : undefined))
const crumbs = computed(() =>
  site.value ? categoryBreadcrumb(catalog.categories, site.value.categoryId) : [],
)

onMounted(async () => {
  try {
    if (!catalog.packs.length) await catalog.loadPacks()
    if (!site.value) {
      const { data, error } = await supabase
        .from('site')
        .select(
          'id, pack_id, category_id, title, url, host, description, status, sort_order, source_added_at',
        )
        .eq('id', Number(props.id))
        .maybeSingle()
      if (error) throw error
      if (data) {
        remote.value = mapSite(data as SiteRow)
        const packMeta = catalog.packById(remote.value.packId)
        if (packMeta) await catalog.loadPackDetail(packMeta.slug)
      }
    }
    if (auth.isLoggedIn) await catalog.loadFavorites()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
})

async function openFolder(id: number) {
  if (!pack.value) return
  await catalog.selectCategory(id)
  router.push({ name: 'pack-category', params: { slug: pack.value.slug, categoryId: String(id) } })
}

async function open() {
  if (!site.value) return
  await catalog.openSite(site.value)
  toast.success(auth.isLoggedIn ? '已打开并登记访问' : '已打开（登录后才会登记访问）')
}

async function fav() {
  if (!site.value) return
  try {
    const res = await catalog.toggleFavorite(site.value.id)
    if (!res.ok) {
      toast.warning(res.message)
      router.push({ name: 'login', query: { redirect: `/sites/${props.id}` } })
      return
    }
    toast.success(res.message)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '操作失败')
  }
}
</script>

<template>
  <BookmarkShell>
    <div class="bp me-page">
      <div class="main">
        <header class="topbar">
          <div class="admin-head">
            <h1>{{ loading ? '站点详情' : site?.title || '站点不存在' }}</h1>
            <p v-if="site">{{ hostOf(site.url) }}</p>
            <p v-else-if="!loading">链接可能已删除或未发布</p>
          </div>
          <AccountNav />
        </header>
        <div class="content">
          <p v-if="loading" class="no-result">加载中…</p>
          <p v-else-if="!site" class="no-result">站点不存在。</p>
          <section v-else class="category-section site-detail">
            <nav class="breadcrumb" aria-label="面包屑">
              <router-link :to="pack ? { name: 'pack', params: { slug: pack.slug } } : '/'">
                {{ pack?.name || '专题' }}
              </router-link>
              <template v-for="c in crumbs" :key="c.id">
                <span class="sep">/</span>
                <button type="button" @click="openFolder(c.id)">{{ c.name }}</button>
              </template>
            </nav>
            <dl class="site-meta">
              <div>
                <dt>地址</dt>
                <dd>
                  <a :href="site.url" target="_blank" rel="noopener noreferrer">{{ site.url }}</a>
                </dd>
              </div>
              <div v-if="site.description">
                <dt>备注</dt>
                <dd>{{ site.description }}</dd>
              </div>
              <div>
                <dt>书签添加时间</dt>
                <dd>{{ formatDate(site.sourceAddedAt) }}</dd>
              </div>
            </dl>
            <div class="site-actions">
              <button type="button" class="site-action primary" @click="open">打开链接</button>
              <button type="button" class="site-action" @click="fav">
                {{ catalog.isFavorited(site.id) ? '取消收藏' : '收藏' }}
              </button>
              <button
                type="button"
                class="site-action"
                @click="router.push(pack ? { name: 'pack', params: { slug: pack.slug } } : '/')"
              >
                返回专题
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  </BookmarkShell>
</template>

<style scoped>
.site-detail .breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-muted, #4a6354);
}

.site-detail .breadcrumb .sep {
  opacity: 0.5;
}

.site-detail .breadcrumb a,
.site-detail .breadcrumb button {
  color: inherit;
}

.site-detail .breadcrumb a:hover,
.site-detail .breadcrumb button:hover {
  color: var(--accent, #15803d);
}

.site-meta {
  margin: 0 0 20px;
  display: grid;
  gap: 12px;
}

.site-meta > div {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid var(--line, rgba(13, 40, 24, 0.14));
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.55);
}

.site-meta dt {
  font-size: 12px;
  color: var(--text-muted, #4a6354);
}

.site-meta dd {
  margin: 0;
  word-break: break-all;
}

.site-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.site-action {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid var(--line, rgba(13, 40, 24, 0.14));
  background: #fff;
}

.site-action.primary {
  background: var(--accent, #15803d);
  border-color: transparent;
  color: #fff;
}
</style>
