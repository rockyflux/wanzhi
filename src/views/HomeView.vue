<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import BookmarkShell from '../components/BookmarkShell.vue'
import PackView from './PackView.vue'
import { useCatalogStore } from '../stores/catalog'

const catalog = useCatalogStore()
const route = useRoute()
const router = useRouter()
const bootstrapped = ref(false)

const activeSlug = computed(() => String(route.params.slug || ''))

onMounted(async () => {
  try {
    if (!catalog.packs.length) await catalog.loadPacks()
    if (!route.params.slug && catalog.packs[0]) {
      await router.replace({ name: 'pack', params: { slug: catalog.packs[0].slug } })
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '专题加载失败')
  } finally {
    bootstrapped.value = true
  }
})
</script>

<template>
  <BookmarkShell>
    <PackView v-if="activeSlug" :pack-slug="activeSlug" />
    <p v-else-if="catalog.error" class="hs-wait">{{ catalog.error }}</p>
    <p v-else-if="bootstrapped && !catalog.loading && !catalog.packs.length" class="hs-wait">还没有专题。</p>
    <p v-else class="hs-wait">正在加载专题…</p>
  </BookmarkShell>
</template>
