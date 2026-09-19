<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { mapSite, type SiteRow } from '../lib/mappers'
import { supabase } from '../lib/supabase'
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
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
})

async function openFolder(id: number) {
  if (!pack.value) return
  await catalog.selectCategory(id)
  router.push({ name: 'pack', params: { slug: pack.value.slug } })
}

async function open() {
  if (!site.value) return
  await catalog.openSite(site.value)
  ElMessage.success(auth.isLoggedIn ? '已打开并登记访问' : '已打开（登录后才会登记访问）')
}

async function fav() {
  if (!site.value) return
  try {
    const res = await catalog.toggleFavorite(site.value.id)
    if (!res.ok) {
      ElMessage.warning(res.message)
      router.push({ name: 'login', query: { redirect: `/sites/${props.id}` } })
      return
    }
    ElMessage.success(res.message)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '操作失败')
  }
}
</script>

<template>
  <el-empty v-if="!loading && !site" description="站点不存在" />
  <el-card v-else-if="site" shadow="never">
    <el-breadcrumb class="mb" separator="/">
      <el-breadcrumb-item>
        <router-link :to="pack ? { name: 'pack', params: { slug: pack.slug } } : '/'">
          {{ pack?.name || '专题' }}
        </router-link>
      </el-breadcrumb-item>
      <el-breadcrumb-item v-for="c in crumbs" :key="c.id">
        <a href="#" @click.prevent="openFolder(c.id)">{{ c.name }}</a>
      </el-breadcrumb-item>
    </el-breadcrumb>
    <h1 class="block-title">{{ site.title }}</h1>
    <p class="hint">{{ hostOf(site.url) }}</p>
    <el-descriptions class="mb" :column="1" border style="margin-top: 16px">
      <el-descriptions-item label="地址">{{ site.url }}</el-descriptions-item>
      <el-descriptions-item v-if="site.description" label="备注">
        {{ site.description }}
      </el-descriptions-item>
      <el-descriptions-item label="书签添加时间">
        {{ formatDate(site.sourceAddedAt) }}
      </el-descriptions-item>
    </el-descriptions>
    <el-button type="primary" @click="open">打开链接</el-button>
    <el-button @click="fav">{{ catalog.isFavorited(site.id) ? '取消收藏' : '收藏' }}</el-button>
    <el-button @click="router.push(pack ? { name: 'pack', params: { slug: pack.slug } } : '/')">
      返回专题
    </el-button>
  </el-card>
</template>
