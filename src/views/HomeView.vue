<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BookmarkShell from '../components/BookmarkShell.vue'
import PackView from './PackView.vue'
import { toast } from '../lib/toast'
import { useCatalogStore } from '../stores/catalog'

const catalog = useCatalogStore()
const route = useRoute()
const router = useRouter()
const bootstrapped = ref(false)

const activeSlug = computed(() => String(route.params.slug || ''))

/** `/` 与 `/p/:slug` 共用本组件；退出后 push('/') 会复用实例，onMounted 不会再跑。 */
async function ensurePackRoute() {
  try {
    if (!catalog.packs.length) await catalog.loadPacks()
    if (!route.params.slug && catalog.packs[0]) {
      await router.replace({ name: 'pack', params: { slug: catalog.packs[0].slug } })
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '专题加载失败')
  } finally {
    bootstrapped.value = true
  }
}

watch(
  () => String(route.params.slug || ''),
  (slug) => {
    if (!slug) void ensurePackRoute()
  },
  { immediate: true },
)
</script>

<template>
  <BookmarkShell>
    <PackView v-if="activeSlug" :pack-slug="activeSlug" />
    <p v-else-if="catalog.error" class="hs-wait">{{ catalog.error }}</p>
    <p v-else-if="bootstrapped && !catalog.loading && !catalog.packs.length" class="hs-wait">还没有专题。</p>
    <p v-else class="hs-wait">正在加载专题…</p>
  </BookmarkShell>
</template>
