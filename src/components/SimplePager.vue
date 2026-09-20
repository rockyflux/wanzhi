<script setup lang="ts">
import { computed } from 'vue'

const page = defineModel<number>('page', { required: true })
const pageSize = defineModel<number>('pageSize', { required: true })

const props = withDefaults(
  defineProps<{
    total: number
    pageSizes?: number[]
  }>(),
  { pageSizes: () => [10, 20, 50, 100] },
)

const maxPage = computed(() => Math.max(1, Math.ceil(props.total / pageSize.value) || 1))

function prev() {
  if (page.value > 1) page.value -= 1
}

function next() {
  if (page.value < maxPage.value) page.value += 1
}
</script>

<template>
  <div class="simple-pager">
    <span class="simple-pager-total">共 {{ total }} 条</span>
    <label class="simple-pager-size">
      每页
      <select v-model.number="pageSize">
        <option v-for="size in pageSizes" :key="size" :value="size">{{ size }}</option>
      </select>
    </label>
    <button type="button" :disabled="page <= 1" @click="prev">上一页</button>
    <span class="simple-pager-pos">{{ page }} / {{ maxPage }}</span>
    <button type="button" :disabled="page >= maxPage" @click="next">下一页</button>
  </div>
</template>
