<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { formatDate, formatDateTime } from '../../lib/tree'
import { useAuthStore } from '../../stores/auth'
import type { ProfileUser } from '../../types'
import { ElMessage, ElMessageBox } from '../../lib/epFeedback'

const auth = useAuthStore()
const loading = ref(true)
const rows = ref<ProfileUser[]>([])
const page = ref(1)
const pageSize = ref(20)

const total = computed(() => rows.value.length)
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

watch([total, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(total.value / pageSize.value) || 1)
  if (page.value > maxPage) page.value = maxPage
})

async function reload() {
  rows.value = await auth.listUsers()
}

onMounted(async () => {
  try {
    await reload()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
})

async function ban(row: ProfileUser) {
  try {
    await ElMessageBox.confirm(`封禁用户「${row.nickname}」？封禁后无法登录。`, '确认封禁', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await auth.setUserStatus(row.id, 'banned')
    ElMessage.success('已封禁')
    await reload()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '操作失败')
  }
}

async function unban(row: ProfileUser) {
  try {
    await auth.setUserStatus(row.id, 'active')
    ElMessage.success('已解除封禁')
    await reload()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '操作失败')
  }
}

async function resetPassword(row: ProfileUser) {
  let password = ''
  try {
    const { value } = await ElMessageBox.prompt(
      `为「${row.nickname}」设置新密码（至少 6 位）`,
      '重置密码',
      {
        inputType: 'password',
        inputPlaceholder: '新密码',
        confirmButtonText: '重置',
        cancelButtonText: '取消',
        inputValidator: (val) => {
          if (!val?.trim()) return '请填写新密码'
          if (val.trim().length < 6) return '新密码至少 6 位'
          return true
        },
      },
    )
    password = value
  } catch {
    return
  }
  try {
    await auth.adminResetPassword(row.id, password)
    ElMessage.success('密码已重置')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '重置失败')
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>用户管理</h1>
        <p class="hint">{{ loading ? '加载中…' : `共 ${total} 位注册用户` }}</p>
      </div>
    </div>

    <el-table :data="pagedRows" v-loading="loading">
      <el-table-column label="用户" min-width="160">
        <template #default="{ row }">
          <div>{{ row.nickname }}</div>
          <div class="sub">{{ row.username }}</div>
        </template>
      </el-table-column>
      <el-table-column label="角色" width="100">
        <template #default="{ row }">
          <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small">
            {{ row.role === 'admin' ? '管理员' : '用户' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'banned' ? 'warning' : 'success'" size="small">
            {{ row.status === 'banned' ? '已封禁' : '正常' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="登录次数" width="100">
        <template #default="{ row }">{{ row.loginCount }}</template>
      </el-table-column>
      <el-table-column label="最后登录" width="170">
        <template #default="{ row }">{{ formatDateTime(row.lastLoginAt) }}</template>
      </el-table-column>
      <el-table-column label="注册时间" width="140">
        <template #default="{ row }">{{ row.createdAt ? formatDate(row.createdAt) : '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button size="small" @click="resetPassword(row as ProfileUser)">重置密码</el-button>
          <el-button
            v-if="row.status !== 'banned'"
            size="small"
            type="danger"
            plain
            :disabled="row.id === auth.user?.id"
            @click="ban(row as ProfileUser)"
          >
            封禁
          </el-button>
          <el-button v-else size="small" @click="unban(row as ProfileUser)">解封</el-button>
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
