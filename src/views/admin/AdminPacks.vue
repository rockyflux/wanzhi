<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import PackIcon from '../../components/PackIcon.vue'
import PackIconPicker from '../../components/PackIconPicker.vue'
import { defaultPackIcon, normalizePackIcon, PACK_TONE_PRESETS, packTone } from '../../lib/packIcons'
import type { PackInput } from '../../stores/catalog'
import { useCatalogStore } from '../../stores/catalog'
import type { Pack } from '../../types'
import { ElMessage, ElMessageBox } from '../../lib/epFeedback'

const catalog = useCatalogStore()
const loading = ref(true)
const saving = ref(false)
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const page = ref(1)
const pageSize = ref(20)

const form = reactive({
  name: '',
  slug: '',
  description: '',
  icon: '',
  tone: '',
  sortOrder: 0,
  status: 1 as 0 | 1,
})

const sorted = computed(() =>
  [...catalog.packs].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
)
const total = computed(() => sorted.value.length)
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return sorted.value.slice(start, start + pageSize.value)
})
const previewTone = computed(() => packTone(form.tone, form.slug))

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

function resetForm(pack?: Pack) {
  editingId.value = pack?.id ?? null
  form.name = pack?.name ?? ''
  form.slug = pack?.slug ?? ''
  form.description = pack?.description ?? ''
  form.icon = normalizePackIcon(pack?.icon) || defaultPackIcon(pack?.slug ?? '') || ''
  form.tone = pack?.tone || packTone('', pack?.slug ?? '')
  form.sortOrder = pack?.sortOrder ?? catalog.packs.length + 1
  form.status = pack?.status ?? 1
}

function startCreate() {
  resetForm()
  dialogVisible.value = true
}

function startEdit(pack: Pack) {
  resetForm(pack)
  dialogVisible.value = true
}

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning('请输入名称')
    return
  }
  const payload: PackInput = {
    name: form.name.trim(),
    slug: form.slug.trim() || form.name.trim(),
    description: form.description.trim(),
    icon: normalizePackIcon(form.icon),
    tone: form.tone,
    sortOrder: Number(form.sortOrder) || 0,
    status: form.status,
  }
  saving.value = true
  try {
    await catalog.savePack(payload, editingId.value ?? undefined)
    ElMessage.success(editingId.value ? '已保存' : '已创建')
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(pack: Pack) {
  const next = pack.status === 1 ? 0 : 1
  try {
    await catalog.savePack(
      {
        name: pack.name,
        slug: pack.slug,
        description: pack.description,
        icon: pack.icon,
        tone: pack.tone,
        sortOrder: pack.sortOrder,
        status: next,
      },
      pack.id,
    )
    ElMessage.success(next === 1 ? '已发布' : '已下架')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '更新失败')
  }
}

async function remove(pack: Pack) {
  try {
    await ElMessageBox.confirm(
      `删除专题「${pack.name}」？仅在没有网址时可删，分类会一并删除。`,
      '确认删除',
      { type: 'warning' },
    )
  } catch {
    return
  }
  const res = await catalog.deletePack(pack.id)
  if (res.ok) ElMessage.success(res.message)
  else ElMessage.warning(res.message)
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>专题管理</h1>
        <p class="hint">{{ loading ? '加载中…' : `共 ${total} 个专题` }}</p>
      </div>
      <el-button type="primary" @click="startCreate">新建专题</el-button>
    </div>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑专题' : '新建专题'" width="600px">
      <el-form label-width="72px">
        <el-form-item label="图标">
          <PackIconPicker v-model="form.icon" :tone="previewTone" />
        </el-form-item>
        <el-form-item label="颜色">
          <div class="tone-row">
            <button
              v-for="tone in PACK_TONE_PRESETS"
              :key="tone"
              type="button"
              class="tone-pick"
              :class="{ on: form.tone.toLowerCase() === tone.toLowerCase() }"
              :style="{ background: tone }"
              :aria-label="tone"
              @click="form.tone = tone"
            />
            <el-color-picker v-model="form.tone" />
          </div>
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.name" maxlength="40" />
        </el-form-item>
        <el-form-item label="短名">
          <el-input v-model="form.slug" maxlength="40" placeholder="英文短名，如 tools" />
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch
            v-model="form.status"
            :active-value="1"
            :inactive-value="0"
            active-text="已发布"
            inactive-text="下架"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-table :data="pagedRows" v-loading="loading">
      <el-table-column label="图标" width="72">
        <template #default="{ row }">
          <span class="pack-mark" :style="{ background: packTone(row.tone, row.slug) }">
            <PackIcon :icon="row.icon" :name="row.name" :slug="row.slug" :size="16" />
          </span>
        </template>
      </el-table-column>
      <el-table-column label="专题" min-width="180">
        <template #default="{ row }">
          <div>{{ row.name }}</div>
          <div class="sub">{{ row.slug }} · {{ row.icon || '默认' }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="简介" min-width="220" show-overflow-tooltip />
      <el-table-column label="链接" width="80">
        <template #default="{ row }">{{ row.publishedCount }}</template>
      </el-table-column>
      <el-table-column label="排序" width="72" prop="sortOrder" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
            {{ row.status === 1 ? '已发布' : '下架' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button size="small" @click="startEdit(row as Pack)">编辑</el-button>
          <el-button size="small" @click="toggleStatus(row as Pack)">{{ row.status === 1 ? '下架' : '发布' }}</el-button>
          <el-button size="small" type="danger" plain @click="remove(row as Pack)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div v-if="total > 0" class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
      />
    </div>
  </div>
</template>

<style scoped>
.pack-mark {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: inline-grid;
  place-items: center;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}
.tone-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.tone-pick {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
}
.tone-pick.on {
  border-color: var(--el-text-color-primary);
}
</style>
