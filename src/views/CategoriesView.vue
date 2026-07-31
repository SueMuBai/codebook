<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useVaultStore } from '@/stores/vault'

const router = useRouter()
const vault = useVaultStore()
const name = ref('')
const color = ref('#668cff')
const editingId = ref<string | null>(null)

function beginEdit(id: string) {
  const category = vault.getCategory(id)
  if (!category) return
  editingId.value = id
  name.value = category.name
  color.value = category.color || '#668cff'
}

function clearForm() {
  editingId.value = null
  name.value = ''
  color.value = '#668cff'
}

async function save() {
  try {
    await vault.upsertCategory({ id: editingId.value ?? undefined, name: name.value, color: color.value })
    showToast(editingId.value ? '分类已更新' : '分类已创建')
    clearForm()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '保存失败')
  }
}

async function remove(id: string, nameValue: string) {
  try {
    await showConfirmDialog({
      title: `删除“${nameValue}”`,
      message: '分类下的条目不会被删除，将变为未分类。',
      confirmButtonText: '删除分类',
      confirmButtonColor: '#d84f61',
    })
    await vault.deleteCategory(id)
    if (editingId.value === id) clearForm()
  } catch {
    // cancelled
  }
}

async function move(id: string, direction: -1 | 1) {
  const ids = vault.categories.map((item) => item.id)
  const index = ids.indexOf(id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= ids.length) return
  ;[ids[index], ids[target]] = [ids[target]!, ids[index]!]
  await vault.reorderCategories(ids)
}
</script>

<template>
  <div class="app-page">
    <div class="page-content stack">
      <header class="page-header">
        <button class="btn-ghost" type="button" @click="router.back()">返回</button>
        <div class="page-header__title">
          <h1 class="text-xl">分类管理</h1>
          <p class="text-muted text-sm">整理保险箱，不改变条目内容</p>
        </div>
      </header>

      <section class="card stack">
        <h2 class="section-title">{{ editingId ? '编辑分类' : '新建分类' }}</h2>
        <label>
          <span class="field-label">名称</span>
          <input v-model="name" class="input" maxlength="40" placeholder="例如：工作、社交、邮箱" />
        </label>
        <label>
          <span class="field-label">颜色</span>
          <input v-model="color" class="color-input" type="color" />
        </label>
        <div class="cluster">
          <button class="btn-primary" type="button" @click="save">{{ editingId ? '保存修改' : '创建分类' }}</button>
          <button v-if="editingId" class="btn-ghost" type="button" @click="clearForm">取消编辑</button>
        </div>
      </section>

      <section class="card stack">
        <h2 class="section-title">已有分类</h2>
        <p v-if="vault.categories.length === 0" class="text-muted text-sm">暂无分类</p>
        <div v-for="(category, index) in vault.categories" :key="category.id" class="category-row">
          <span class="category-dot" :style="{ background: category.color || 'var(--color-primary)' }" />
          <span class="grow">{{ category.name }}</span>
          <button class="btn-icon" :disabled="index === 0" aria-label="上移" @click="move(category.id, -1)">↑</button>
          <button class="btn-icon" :disabled="index === vault.categories.length - 1" aria-label="下移" @click="move(category.id, 1)">↓</button>
          <button class="btn-ghost" @click="beginEdit(category.id)">编辑</button>
          <button class="btn-danger" @click="remove(category.id, category.name)">删除</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.color-input { width: 72px; height: 46px; padding: 4px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-soft); }
.category-row { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); }
.category-row:last-child { border-bottom: 0; }
.category-dot { width: 12px; height: 12px; border-radius: 50%; }
@media (max-width: 560px) { .category-row { flex-wrap: wrap; } .category-row .grow { flex-basis: calc(100% - 28px); } }
</style>
