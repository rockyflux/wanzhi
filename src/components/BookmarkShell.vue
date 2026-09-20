<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCatalogStore } from '../stores/catalog'
import { packTone } from '../lib/packIcons'
import { applyDocumentTheme } from '../lib/theme'
import { toast } from '../lib/toast'
import PackIcon from './PackIcon.vue'

type RailMode = 'expanded' | 'collapsed' | 'hover'

const RAIL_KEY = 'bm-home-rail'
const MODE_OPTIONS: { id: RailMode; label: string; hint: string }[] = [
  { id: 'expanded', label: '固定展开', hint: '专题名一直显示' },
  { id: 'collapsed', label: '始终折叠', hint: '只留图标' },
  { id: 'hover', label: '悬停展开', hint: '鼠标移到左边才展开' },
]

function readMode(): RailMode {
  const raw = localStorage.getItem(RAIL_KEY)
  if (raw === 'expanded' || raw === 'collapsed' || raw === 'hover') return raw
  return 'hover'
}

const props = withDefaults(
  defineProps<{
    stageClass?: string
  }>(),
  { stageClass: '' },
)

const catalog = useCatalogStore()
const route = useRoute()
const router = useRouter()

const railMode = ref<RailMode>(readMode())
const hoverOpen = ref(false)
const modeMenuOpen = ref(false)
const isNarrow = ref(false)
const isDark = ref(localStorage.getItem('bm-theme') === 'dark')

watch(isDark, (value) => applyDocumentTheme(value), { immediate: true })

provide('bm-theme', {
  isDark,
  toggleTheme() {
    isDark.value = !isDark.value
    localStorage.setItem('bm-theme', isDark.value ? 'dark' : 'light')
  },
})

const railCollapsed = computed(() => !isNarrow.value && railMode.value !== 'expanded')
const railExpanded = computed(
  () => isNarrow.value || railMode.value === 'expanded' || (railMode.value === 'hover' && hoverOpen.value),
)
const currentMode = computed(() => MODE_OPTIONS.find((item) => item.id === railMode.value) ?? MODE_OPTIONS[2])
const activeSlug = computed(() => String(route.params.slug || ''))

function setMode(mode: RailMode) {
  railMode.value = mode
  localStorage.setItem(RAIL_KEY, mode)
  hoverOpen.value = false
  modeMenuOpen.value = false
}

function onRailEnter() {
  if (isNarrow.value || railMode.value !== 'hover') return
  hoverOpen.value = true
}

function onRailLeave() {
  if (railMode.value !== 'hover') return
  hoverOpen.value = false
  modeMenuOpen.value = false
}

function openPack(slug: string) {
  void router.push({ name: 'pack', params: { slug } })
}

function onDocClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.hs-mode')) modeMenuOpen.value = false
}

let mq: MediaQueryList | null = null
function syncNarrow() {
  isNarrow.value = !!mq?.matches
  if (isNarrow.value) hoverOpen.value = false
}

onMounted(async () => {
  document.addEventListener('click', onDocClick)
  mq = window.matchMedia('(max-width: 768px)')
  syncNarrow()
  mq.addEventListener('change', syncNarrow)
  try {
    if (!catalog.packs.length) await catalog.loadPacks()
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '专题加载失败')
  }
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  mq?.removeEventListener('change', syncNarrow)
})
</script>

<template>
  <div
    class="hs"
    :class="{
      dark: isDark,
      'is-collapsed': railCollapsed,
      'is-expanded': railExpanded,
    }"
  >
    <div class="hs-slot">
      <aside class="hs-rail" aria-label="专题" @mouseenter="onRailEnter" @mouseleave="onRailLeave">
        <router-link class="hs-logo" to="/" title="万址">
          <svg class="hs-logo-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="6" fill="#0D5C63" />
            <path d="M8 10h16v2H8V10zm0 5h12v2H8v-2zm0 5h14v2H8v-2z" fill="#F4EFE6" />
            <circle cx="23" cy="22" r="4" stroke="#E07A5F" stroke-width="2" />
          </svg>
          <span class="hs-logo-name">万址</span>
        </router-link>
        <nav class="hs-list">
          <button
            v-for="pack in catalog.packs"
            :key="pack.id"
            type="button"
            class="hs-item"
            :class="{ active: pack.slug === activeSlug }"
            :title="pack.name"
            :aria-current="pack.slug === activeSlug ? 'page' : undefined"
            @click="openPack(pack.slug)"
          >
            <span class="hs-mark" :style="{ '--tone': packTone(pack.tone, pack.slug) }" aria-hidden="true">
              <PackIcon :icon="pack.icon" :name="pack.name" :slug="pack.slug" :size="15" />
            </span>
            <span class="hs-label">{{ pack.name }}</span>
            <span class="hs-count">{{ pack.publishedCount.toLocaleString('zh-CN') }}</span>
          </button>
        </nav>
        <div class="hs-mode" @click.stop>
          <button
            type="button"
            class="hs-mode-btn"
            :aria-expanded="modeMenuOpen"
            :aria-label="`侧栏：${currentMode.label}`"
            :title="currentMode.label"
            @click="modeMenuOpen = !modeMenuOpen"
          >
            <svg v-if="railMode === 'expanded'" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M3 4.5A1.5 1.5 0 014.5 3h11A1.5 1.5 0 0117 4.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 15.5v-11zM5 5v10h3V5H5zm5 0v10h5V5h-5z" />
            </svg>
            <svg v-else-if="railMode === 'collapsed'" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M3 4.5A1.5 1.5 0 014.5 3h11A1.5 1.5 0 0117 4.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 15.5v-11zM5 5v10h2V5H5zm4 0v10h6V5H9z" />
            </svg>
            <svg v-else viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M3 4.5A1.5 1.5 0 014.5 3h11A1.5 1.5 0 0117 4.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 15.5v-11zM5 5v10h2.5V5H5zm4 0v10h6V5H9z" />
            </svg>
            <span class="hs-mode-label">{{ currentMode.label }}</span>
          </button>
          <div v-if="modeMenuOpen" class="hs-menu" role="menu">
            <button
              v-for="opt in MODE_OPTIONS"
              :key="opt.id"
              type="button"
              role="menuitemradio"
              :aria-checked="railMode === opt.id"
              :class="{ active: railMode === opt.id }"
              @click="setMode(opt.id)"
            >
              <span class="hs-menu-label">{{ opt.label }}</span>
              <span class="hs-menu-hint">{{ opt.hint }}</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
    <div class="hs-stage" :class="props.stageClass">
      <slot />
    </div>
  </div>
</template>
