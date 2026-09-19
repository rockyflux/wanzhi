<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { loadLucideIconNames, PACK_ICON_SUGGESTIONS } from '../lib/packIcons'

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    tone?: string
  }>(),
  { tone: '#1b4332' },
)

const query = ref('')
const allNames = ref<string[]>([])
const loading = ref(true)
const loadError = ref('')

onMounted(async () => {
  try {
    allNames.value = await loadLucideIconNames()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '图标库加载失败'
  } finally {
    loading.value = false
  }
})

watch(
  () => model.value,
  (value) => {
    if (value && !query.value) query.value = value
  },
)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const pool = allNames.value.length ? allNames.value : [...PACK_ICON_SUGGESTIONS]
  if (!q) {
    const suggested = PACK_ICON_SUGGESTIONS.filter((name) => pool.includes(name))
    const suggestedSet = new Set<string>(suggested)
    const rest = pool.filter((name) => !suggestedSet.has(name))
    return [...suggested, ...rest].slice(0, 120)
  }
  return pool.filter((name) => name.includes(q)).slice(0, 120)
})

function pick(name: string) {
  model.value = model.value === name ? '' : name
}
</script>

<template>
  <div class="icon-picker">
    <div class="icon-picker-preview" :style="{ background: tone }">
      <Icon v-if="model" :icon="`lucide:${model}`" width="18" height="18" />
      <span v-else class="icon-picker-empty">?</span>
    </div>
    <el-input
      v-model="query"
      clearable
      placeholder="搜索 Lucide 图标，如 book、cloud、wrench"
      :disabled="loading"
    />
    <p v-if="loading" class="icon-picker-hint">正在加载 Lucide 图标库…</p>
    <p v-else-if="loadError" class="icon-picker-hint is-error">{{ loadError }}</p>
    <p v-else class="icon-picker-hint">
      开源图标库
      <a href="https://lucide.dev/icons/" target="_blank" rel="noopener noreferrer">Lucide</a>
      · 共 {{ allNames.length || PACK_ICON_SUGGESTIONS.length }} 个，点选即可
    </p>
    <div class="icon-picker-grid" role="listbox" :aria-label="'Lucide 图标'">
      <button
        v-for="name in filtered"
        :key="name"
        type="button"
        class="icon-picker-item"
        :class="{ on: model === name }"
        :title="name"
        role="option"
        :aria-selected="model === name"
        @click="pick(name)"
      >
        <Icon :icon="`lucide:${name}`" width="18" height="18" />
      </button>
    </div>
    <p v-if="!loading && !filtered.length" class="icon-picker-hint">没有匹配的图标</p>
  </div>
</template>

<style scoped>
.icon-picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}
.icon-picker-preview {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #fff;
}
.icon-picker-empty {
  font-size: 14px;
  font-weight: 700;
  opacity: 0.8;
}
.icon-picker-hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.icon-picker-hint.is-error {
  color: var(--el-color-danger);
}
.icon-picker-hint a {
  color: var(--el-color-primary);
}
.icon-picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
  gap: 6px;
  max-height: 220px;
  overflow: auto;
  padding: 2px;
}
.icon-picker-item {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  cursor: pointer;
}
.icon-picker-item:hover {
  border-color: var(--el-color-primary-light-5);
  color: var(--el-color-primary);
}
.icon-picker-item.on {
  border-color: var(--el-color-primary);
  outline: 2px solid var(--el-color-primary-light-5);
  color: var(--el-color-primary);
}
</style>
