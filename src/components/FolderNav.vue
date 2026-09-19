<script setup lang="ts">
import type { Category } from '../types'

defineProps<{
  nodes: Category[]
  selectedId: number | null
  openIds: number[]
  forceOpen: boolean
  countOf: (id: number) => number
}>()

const emit = defineEmits<{
  select: [id: number]
  toggle: [id: number]
}>()
</script>

<template>
  <ul class="nav-list">
    <li
      v-for="node in nodes"
      :key="node.id"
      class="nav-item"
      :class="{
        'has-children': !!node.children?.length,
        'is-open': forceOpen || openIds.includes(node.id),
        'is-active': selectedId === node.id,
      }"
    >
      <div class="nav-row">
        <button
          v-if="node.children?.length"
          type="button"
          class="nav-toggle"
          aria-label="展开或折叠"
          @click="emit('toggle', node.id)"
        >
          <svg class="nav-chevron" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        <span v-else class="nav-toggle-spacer"></span>
        <button type="button" class="nav-link" :title="node.name" @click="emit('select', node.id)">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          </span>
          <span class="nav-text">{{ node.name }}</span>
          <span class="nav-count">{{ countOf(node.id) }}</span>
        </button>
      </div>
      <FolderNav
        v-if="node.children?.length"
        class="nav-children"
        :nodes="node.children"
        :selected-id="selectedId"
        :open-ids="openIds"
        :force-open="forceOpen"
        :count-of="countOf"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
      />
    </li>
  </ul>
</template>
