<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps<{
  title: string
  subtitle?: string
}>()

const isDark = ref(localStorage.getItem('bm-theme') === 'dark')
const ready = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    ready.value = true
  })
})
</script>

<template>
  <div class="bp auth-gate" :class="{ dark: isDark, ready }">
    <div class="auth-gate-panel">
      <router-link class="auth-brand" to="/" title="万址">
        <svg class="auth-brand-mark" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="6" fill="#0D5C63" />
          <path d="M8 10h16v2H8V10zm0 5h12v2H8v-2zm0 5h14v2H8v-2z" fill="#F4EFE6" />
          <circle cx="23" cy="22" r="4" stroke="#E07A5F" stroke-width="2" />
        </svg>
        <span class="auth-brand-name">万址</span>
      </router-link>

      <header class="auth-head">
        <h1>{{ props.title }}</h1>
        <p v-if="props.subtitle">{{ props.subtitle }}</p>
      </header>

      <slot />
    </div>
  </div>
</template>
