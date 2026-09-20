<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import { ElMessage } from '../../lib/epFeedback'

type TableUsage = {
  name: string
  total_bytes: number
  table_bytes: number
  index_bytes: number
  row_estimate: number
}

type UsageStats = {
  database_bytes: number
  auth_users: number
  profiles: number
  checked_at: string
  tables: TableUsage[]
}

/** Free plan DB soft reference; paid plans differ — see Dashboard. */
const FREE_DB_LIMIT_BYTES = 500 * 1024 * 1024

const loading = ref(true)
const stats = ref<UsageStats | null>(null)

const projectRef = computed(() => {
  try {
    const host = new URL(import.meta.env.VITE_SUPABASE_URL).hostname
    return host.split('.')[0] || ''
  } catch {
    return ''
  }
})

const dashboardUsageUrl = computed(() =>
  projectRef.value
    ? `https://supabase.com/dashboard/project/${projectRef.value}/settings/billing/usage`
    : 'https://supabase.com/dashboard',
)

const dbPercent = computed(() => {
  const bytes = stats.value?.database_bytes ?? 0
  return Math.min(100, Math.round((bytes / FREE_DB_LIMIT_BYTES) * 1000) / 10)
})

const summary = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    {
      label: '数据库',
      value: formatBytes(s.database_bytes),
      note: `约 Free 额度 ${dbPercent.value}%（500 MB）`,
      tone: '#ff5a1f',
    },
    {
      label: 'Auth 用户',
      value: String(s.auth_users),
      note: 'auth.users',
      tone: '#3d5a80',
    },
    {
      label: '资料行',
      value: String(s.profiles),
      note: 'profiles',
      tone: '#2a9d8f',
    },
  ]
})

const tableRows = computed(() => stats.value?.tables ?? [])

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n
  let i = -1
  do {
    v /= 1024
    i += 1
  } while (v >= 1024 && i < units.length - 1)
  return `${v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

function formatCheckedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

async function load() {
  const { data, error } = await supabase.rpc('admin_usage_stats')
  if (error) throw error
  const raw = data as UsageStats
  stats.value = {
    ...raw,
    tables: Array.isArray(raw?.tables) ? raw.tables : [],
  }
}

onMounted(async () => {
  try {
    await load()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="category-section admin-stats admin-usage">
    <div class="section-head">
      <h2 class="section-title">Supabase 用量</h2>
      <span class="section-meta">
        {{ loading ? '加载中…' : stats ? `采集于 ${formatCheckedAt(stats.checked_at)}` : '—' }}
      </span>
    </div>

    <p class="usage-lead">
      以下为项目库体积与分表占用（Postgres）。出站流量、Storage、MAU 等账单指标请打开
      <a class="usage-dash-link" :href="dashboardUsageUrl" target="_blank" rel="noopener noreferrer"
        >Dashboard 用量</a
      >。
    </p>

    <div class="stats-grid" :aria-busy="loading">
      <article v-for="item in summary" :key="item.label" class="stat-tile" :style="{ '--tone': item.tone }">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ loading ? '—' : item.value }}</strong>
        <span class="stat-note">{{ item.note }}</span>
      </article>
    </div>

    <div v-if="!loading && stats" class="usage-meter" role="meter" :aria-valuenow="dbPercent" aria-valuemin="0" aria-valuemax="100">
      <div class="usage-meter-head">
        <span>数据库相对 Free 500 MB</span>
        <span>{{ dbPercent }}%</span>
      </div>
      <div class="usage-meter-track">
        <div class="usage-meter-fill" :style="{ width: `${dbPercent}%` }" />
      </div>
    </div>

    <div class="section-head usage-table-head">
      <h2 class="section-title">分表占用</h2>
      <span class="section-meta">含索引 · 行数为估计值</span>
    </div>

    <el-table :data="tableRows" v-loading="loading" empty-text="暂无数据">
      <el-table-column prop="name" label="表" min-width="140" />
      <el-table-column label="总占用" min-width="100">
        <template #default="{ row }">{{ formatBytes(row.total_bytes) }}</template>
      </el-table-column>
      <el-table-column label="数据" min-width="100">
        <template #default="{ row }">{{ formatBytes(row.table_bytes) }}</template>
      </el-table-column>
      <el-table-column label="索引" min-width="100">
        <template #default="{ row }">{{ formatBytes(row.index_bytes) }}</template>
      </el-table-column>
      <el-table-column label="行数（估）" min-width="100" align="right">
        <template #default="{ row }">{{ row.row_estimate.toLocaleString('zh-CN') }}</template>
      </el-table-column>
    </el-table>
  </section>
</template>
