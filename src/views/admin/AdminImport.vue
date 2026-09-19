<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, type UploadFile } from 'element-plus'
import { formatDate } from '../../lib/tree'
import { useCatalogStore } from '../../stores/catalog'
import type { ImportBatch } from '../../types'

const catalog = useCatalogStore()
const last = ref<ImportBatch | null>(null)
const mode = ref<'existing' | 'new'>('existing')
const packId = ref(0)
const replaceExisting = ref(false)
const newName = ref('')
const newSlug = ref('')
const pending = ref(false)
const loading = ref(true)
const page = ref(1)
const pageSize = ref(20)

const total = computed(() => catalog.imports.length)
const pagedImports = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return catalog.imports.slice(start, start + pageSize.value)
})

watch([total, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value) || 1)
  if (page.value > maxPage) page.value = maxPage
})

onMounted(async () => {
  try {
    await catalog.loadAdminCatalog()
    await catalog.loadImports()
    packId.value = catalog.packs.find((p) => p.slug === 'tools')?.id ?? catalog.packs[0]?.id ?? 0
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
})

const sampleHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <DT><H3>导入演示</H3>
  <DL><p>
    <DT><H3>子文件夹</H3>
    <DL><p>
      <DT><A HREF="https://example.org/proto">原型示例站</A>
      <DD>从书签 HTML 解析而来</DD>
    </DL><p>
    <DT><A HREF="https://httpbin.org/get">HTTPBin</A>
  </DL><p>
</DL><p>`

function tagType(status: ImportBatch['status']) {
  if (status === 'SUCCESS') return 'success'
  if (status === 'PARTIAL') return 'warning'
  return 'danger'
}

function tagLabel(status: ImportBatch['status']) {
  if (status === 'SUCCESS') return '成功'
  if (status === 'PARTIAL') return '部分成功'
  return '失败'
}

function target() {
  if (mode.value === 'new') {
    if (!newName.value.trim()) {
      ElMessage.warning('新建专题需要名称')
      return null
    }
    return { name: newName.value.trim(), slug: newSlug.value.trim() || newName.value.trim() }
  }
  return { packId: packId.value, replace: replaceExisting.value }
}

async function runImport(filename: string, html: string) {
  const to = target()
  if (!to) return
  pending.value = true
  try {
    last.value = await catalog.importBookmarkHtml(filename, html, to)
    await catalog.loadImports()
    ElMessage.success(
      `导入到「${last.value.packName || '专题'}」：+${last.value.createdCategories} 文件夹，+${last.value.createdSites} 链接`,
    )
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '导入失败')
  } finally {
    pending.value = false
  }
}

async function onFile(file: File | undefined) {
  if (!file) return
  await runImport(file.name, await file.text())
}

function onChange(file: UploadFile) {
  void onFile(file.raw)
}

function runSample() {
  void runImport('sample-bookmarks.html', sampleHtml)
}
</script>

<template>
  <div>
    <h1 class="block-title">书签导入</h1>
    <p class="hint mb">
      上传 Chrome / Edge / Firefox 导出的 HTML，写入 Supabase。大文件请分批；五万级用仓库脚本 scripts/import_bookmarks.py。
    </p>

    <el-form class="mb" inline>
      <el-form-item label="目标">
        <el-radio-group v-model="mode">
          <el-radio value="existing">已有专题</el-radio>
          <el-radio value="new">新建专题</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="mode === 'existing'" label="专题">
        <el-select v-model="packId" style="width: 180px">
          <el-option v-for="p in catalog.packs" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="mode === 'existing'">
        <el-checkbox v-model="replaceExisting">导入前清空该专题</el-checkbox>
      </el-form-item>
      <template v-else>
        <el-form-item label="名称">
          <el-input v-model="newName" placeholder="例如 在线工具" />
        </el-form-item>
        <el-form-item label="slug">
          <el-input v-model="newSlug" placeholder="tools" />
        </el-form-item>
      </template>
    </el-form>

    <el-upload
      class="mb"
      drag
      action="#"
      accept=".html,text/html"
      :auto-upload="false"
      :show-file-list="false"
      :disabled="pending"
      :on-change="onChange"
    >
      <div>{{ pending ? '正在导入…' : '拖拽书签 HTML 到此处，或点击选择文件' }}</div>
    </el-upload>
    <el-button class="mb" :loading="pending" @click="runSample">用内置样例导入</el-button>

    <el-card v-if="last" class="mb" shadow="never">
      <template #header>
        最近一次结果 · {{ last.filename }}
        <el-tag class="ml" :type="tagType(last.status)" size="small">{{ tagLabel(last.status) }}</el-tag>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="新建文件夹">{{ last.createdCategories }}</el-descriptions-item>
        <el-descriptions-item label="新建链接">{{ last.createdSites }}</el-descriptions-item>
        <el-descriptions-item label="跳过（重复 URL）">{{ last.skipped }}</el-descriptions-item>
        <el-descriptions-item label="失败">{{ last.failed }}</el-descriptions-item>
      </el-descriptions>
      <ul v-if="last.notes.length" class="hint">
        <li v-for="(n, i) in last.notes" :key="i">{{ n }}</li>
      </ul>
    </el-card>

    <h2 class="block-title mb">导入历史</h2>
    <el-table :data="pagedImports" v-loading="loading" empty-text="还没有导入记录">
      <el-table-column label="时间" width="140">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column prop="packName" label="专题" width="140" />
      <el-table-column prop="filename" label="文件" min-width="160" />
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <el-tag :type="tagType(row.status)" size="small">{{ tagLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="统计" min-width="220">
        <template #default="{ row }">
          +{{ row.createdCategories }} 夹 / +{{ row.createdSites }} 链 / 跳过 {{ row.skipped }}
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
