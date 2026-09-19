<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { Category, Site, SiteStatus } from '../../types'
import { flattenCategories, hostOf } from '../../lib/tree'
import { useCatalogStore } from '../../stores/catalog'

const catalog = useCatalogStore()
const loading = ref(true)
const page = ref(1)
const pageSize = ref(20)
const formPackId = ref<number | null>(null)
const categoryLoading = ref(false)
const categoryOptions = ref<Array<{ id: number; label: string }>>([])
const editing = ref<(Partial<Site> & { title: string; url: string; categoryId: number | null }) | null>(
  null,
)
const dialogVisible = computed({
  get: () => editing.value != null,
  set: (open) => {
    if (!open) editing.value = null
  },
})

const total = computed(() => catalog.sites.length)
const pagedSites = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return catalog.sites.slice(start, start + pageSize.value)
})

watch([total, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value) || 1)
  if (page.value > maxPage) page.value = maxPage
})

onMounted(async () => {
  try {
    await catalog.loadAdminCatalog()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
})

const catName = computed(() => {
  const map = new Map(catalog.flatCategories.map((c) => [c.id, c.name]))
  return (id: number) => map.get(id) || String(id)
})

const statusLabel: Record<SiteStatus, string> = {
  PUBLISHED: '已发布',
  DRAFT: '草稿',
  OFFLINE: '下架',
}

function statusType(status: SiteStatus) {
  if (status === 'PUBLISHED') return 'success'
  if (status === 'DRAFT') return 'warning'
  return 'info'
}

function optionsFromTree(tree: Category[]) {
  return flattenCategories(tree).map((c) => ({
    id: c.id,
    label: `${'— '.repeat(Math.max(0, c.level - 1))}${c.name}`,
  }))
}

function syncCategorySelection() {
  if (!editing.value) return
  const opts = categoryOptions.value
  if (!opts.some((o) => o.id === editing.value!.categoryId)) {
    editing.value.categoryId = opts[0]?.id ?? null
  }
}

async function refreshCategoriesForPack(packId: number | null) {
  if (packId == null) {
    categoryOptions.value = []
    syncCategorySelection()
    return
  }
  const mem = catalog.treeOf(packId)
  if (mem.length) {
    categoryOptions.value = optionsFromTree(mem)
    syncCategorySelection()
    return
  }
  categoryLoading.value = true
  try {
    const tree = await catalog.loadCategoriesForPack(packId)
    categoryOptions.value = optionsFromTree(tree)
    syncCategorySelection()
  } catch (e) {
    categoryOptions.value = []
    ElMessage.error(e instanceof Error ? e.message : '分类加载失败')
  } finally {
    categoryLoading.value = false
  }
}

async function onPackChange(value: number | string | null) {
  const pack = catalog.packs.find((p) => String(p.id) === String(value ?? ''))
  formPackId.value = pack?.id ?? null
  await refreshCategoriesForPack(formPackId.value)
}

async function startCreate() {
  formPackId.value = catalog.packs[0]?.id ?? null
  editing.value = {
    title: '',
    url: 'https://',
    categoryId: null,
    status: 'PUBLISHED',
    description: '',
  }
  await refreshCategoriesForPack(formPackId.value)
}

async function startEdit(s: Site) {
  formPackId.value = s.packId
  editing.value = { ...s }
  await refreshCategoriesForPack(formPackId.value)
}

async function save() {
  if (formPackId.value == null) {
    ElMessage.warning('请先选择专题')
    return
  }
  if (!editing.value?.categoryId) {
    ElMessage.warning('请选择分类')
    return
  }
  if (!editing.value?.title || !editing.value.url) {
    ElMessage.warning('请填写标题和 URL')
    return
  }
  try {
    await catalog.upsertSite({
      ...editing.value,
      categoryId: editing.value.categoryId,
    })
    ElMessage.success('已保存')
    editing.value = null
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  }
}

async function setStatus(s: Site, status: SiteStatus) {
  try {
    await catalog.setSiteStatus(s.id, status)
    ElMessage.success(status === 'PUBLISHED' ? '已上架' : '已下架')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '更新失败')
  }
}

async function remove(s: Site) {
  try {
    await ElMessageBox.confirm(`删除「${s.title}」？`, '确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await catalog.deleteSite(s.id)
    ElMessage.success('已删除')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>网址维护</h1>
        <p class="hint">{{ loading ? '加载中…' : `共 ${total} 条（最近最多 2000 条）` }}</p>
      </div>
      <el-button type="primary" @click="startCreate">新建网址</el-button>
    </div>

    <el-dialog v-model="dialogVisible" :title="editing?.id ? '编辑网址' : '新建网址'" width="520px">
      <el-form v-if="editing" label-width="72px">
        <el-form-item label="专题">
          <el-select
            :model-value="formPackId ?? undefined"
            filterable
            placeholder="先选择专题"
            style="width: 100%"
            @change="onPackChange"
          >
            <el-option v-for="p in catalog.packs" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="分类">
          <el-select
            :key="String(formPackId ?? 'none')"
            v-model="editing.categoryId"
            filterable
            clearable
            :loading="categoryLoading"
            :disabled="formPackId == null || categoryLoading || !categoryOptions.length"
            :placeholder="
              formPackId == null
                ? '请先选择专题'
                : categoryLoading
                  ? '分类加载中…'
                  : categoryOptions.length
                    ? '搜索或选择分类'
                    : '该专题暂无分类'
            "
            style="width: 100%"
          >
            <el-option
              v-for="o in categoryOptions"
              :key="o.id"
              :label="o.label"
              :value="o.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="editing.title" />
        </el-form-item>
        <el-form-item label="URL">
          <el-input v-model="editing.url" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editing.status" style="width: 100%">
            <el-option label="已发布" value="PUBLISHED" />
            <el-option label="草稿" value="DRAFT" />
            <el-option label="下架" value="OFFLINE" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editing.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="categoryLoading" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-table :data="pagedSites" v-loading="loading">
      <el-table-column label="标题" min-width="180">
        <template #default="{ row }">
          <div>{{ row.title }}</div>
          <div class="sub">{{ hostOf(row.url) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="专题" width="120">
        <template #default="{ row }">{{ catalog.packById(row.packId)?.name }}</template>
      </el-table-column>
      <el-table-column label="分类" min-width="120">
        <template #default="{ row }">{{ catName(row.categoryId) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusLabel[row.status as SiteStatus] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240">
        <template #default="{ row }">
          <el-button size="small" @click="startEdit(row)">编辑</el-button>
          <el-button
            v-if="row.status !== 'PUBLISHED'"
            size="small"
            @click="setStatus(row, 'PUBLISHED')"
          >
            上架
          </el-button>
          <el-button v-else size="small" @click="setStatus(row, 'OFFLINE')">下架</el-button>
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
