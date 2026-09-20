<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Category } from '../../types'
import { flattenCategories } from '../../lib/tree'
import { useCatalogStore } from '../../stores/catalog'
import { ElMessage, ElMessageBox } from '../../lib/epFeedback'

const catalog = useCatalogStore()
const packId = ref<number>(0)
const parentId = ref<number | null>(null)
const name = ref('')
const loading = ref(true)
const page = ref(1)
const pageSize = ref(20)

const tree = computed(() => catalog.treeOf(Number(packId.value)))
const rows = computed(() => flattenCategories(tree.value))
const total = computed(() => rows.value.length)
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

async function refreshCategories(pid: number) {
  if (!pid) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    // Per-pack fetch: loadAdminCatalog caps categories at 10k and can miss other packs.
    await catalog.loadCategoriesForPack(pid, { force: true })
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '分类加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    await catalog.loadAdminCatalog()
    packId.value = catalog.packs[0]?.id ?? 0
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
    loading.value = false
  }
})

watch(packId, (id) => {
  parentId.value = null
  page.value = 1
  void refreshCategories(Number(id))
})

watch([total, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value) || 1)
  if (page.value > maxPage) page.value = maxPage
})

function options(nodes: Category[], depth = 0): Array<{ id: number; label: string }> {
  const out: Array<{ id: number; label: string }> = []
  for (const n of nodes) {
    out.push({ id: n.id, label: `${'— '.repeat(depth)}${n.name}` })
    if (n.children?.length) out.push(...options(n.children, depth + 1))
  }
  return out
}

async function add() {
  if (!name.value.trim()) {
    ElMessage.warning('请输入文件夹名')
    return
  }
  try {
    await catalog.addCategory(parentId.value, name.value.trim(), Number(packId.value))
    ElMessage.success('已创建')
    name.value = ''
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '创建失败')
  }
}

async function rename(c: Category) {
  try {
    const { value } = await ElMessageBox.prompt('新名称', '改名', {
      inputValue: c.name,
      inputPattern: /\S+/,
      inputErrorMessage: '名称不能为空',
    })
    await catalog.renameCategory(c.id, value.trim())
    ElMessage.success('已改名')
  } catch {
    /* cancelled */
  }
}

async function remove(c: Category) {
  const res = await catalog.removeCategory(c.id)
  if (res.ok) ElMessage.success(res.message)
  else ElMessage.warning(res.message)
}
</script>

<template>
  <div>
    <h1 class="block-title">分类维护</h1>
    <p class="hint mb">
      {{ loading ? '加载中…' : `当前专题共 ${total} 个文件夹，写入 Supabase` }}
    </p>

    <el-form class="mb" inline @submit.prevent="add">
      <el-form-item label="专题">
        <el-select v-model="packId" style="width: 180px">
          <el-option v-for="p in catalog.packs" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="父级">
        <el-select v-model="parentId" clearable placeholder="一级文件夹" style="width: 220px">
          <el-option v-for="o in options(tree)" :key="o.id" :label="o.label" :value="o.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="名称">
        <el-input v-model="name" placeholder="新文件夹" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="submit">新增</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="pagedRows" v-loading="loading">
      <el-table-column label="名称" min-width="200">
        <template #default="{ row }">{{ '　'.repeat(row.level - 1) }}{{ row.name }}</template>
      </el-table-column>
      <el-table-column label="层级" width="80">
        <template #default="{ row }">L{{ row.level }}</template>
      </el-table-column>
      <el-table-column prop="path" label="path" min-width="160" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button size="small" @click="rename(row)">改名</el-button>
          <el-button size="small" type="danger" plain @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="total > 0" class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
      />
    </div>
  </div>
</template>
