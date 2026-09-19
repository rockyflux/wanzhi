<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { isLucideIcon, packIconifyId, packMarkFallback } from '../lib/packIcons'

const props = withDefaults(
  defineProps<{
    icon?: string
    name?: string
    slug?: string
    size?: number
  }>(),
  {
    icon: '',
    name: '',
    slug: '',
    size: 16,
  },
)

const useLucide = computed(() => isLucideIcon(props.icon) || Boolean(props.slug))
const iconifyId = computed(() => packIconifyId(props.icon, props.slug))
const fallback = computed(() => packMarkFallback(props.icon, props.name || '签'))
</script>

<template>
  <Icon v-if="useLucide" :icon="iconifyId" :width="size" :height="size" />
  <span v-else class="pack-mark-text">{{ fallback }}</span>
</template>

<style scoped>
.pack-mark-text {
  line-height: 1;
  font-weight: 700;
}
</style>
