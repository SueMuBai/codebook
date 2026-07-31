<script setup lang="ts">
import { ref } from 'vue'
import { showToast } from 'vant'
import { goBackOr } from '@/services/navigation/goBack'
import { confirmDanger } from '@/services/ui/dialogs'
import { useVaultStore } from '@/stores/vault'

const vault = useVaultStore()
const name = ref('')
const color = ref('#2dd4bf')
const editingId = ref<string | null>(null)
const saving = ref(false)

function beginEdit(id: string) {
  const category = vault.getCategory(id)
  if (!category) return
  editingId.value = id
  name.value = category.name
  color.value = category.color || '#2dd4bf'
}

function clearForm() {
  editingId.value = null
  name.value = ''
  color.value = '#2dd4bf'
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    await vault.upsertCategory({ id: editingId.value ?? undefined, name: name.value, color: color.value })
    showToast(editingId.value ? '分类已更新' : '分类已创建')
    clearForm()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(id: string, nameValue: string) {
  const confirmed = await confirmDanger({
    title: `删除“${nameValue}”`,
    message: '分类下的条目不会被删除，将变为未分类。',
    confirmText: '删除分类',
  })
  if (!confirmed) return
  await vault.deleteCategory(id)
  if (editingId.value === id) clearForm()
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
        <button class="btn-icon page-back" type="button" aria-label="返回" @click="goBackOr('/settings')"><AppIcon name="back" /></button>
        <div class="page-header__title">
          <h1 class="text-xl">分类管理</h1>
          <p class="text-muted text-sm">用颜色和顺序建立清晰的保险箱索引</p>
        </div>
      </header>

      <div class="category-layout">
        <section class="card category-editor stack">
          <div class="editor-preview" :style="{ '--preview-color': color }">
            <span class="editor-preview__mark"><AppIcon name="folder" :size="26" /></span>
            <div><span class="text-muted text-xs">分类预览</span><strong>{{ name.trim() || '新分类' }}</strong></div>
          </div>
          <div class="section-heading"><div class="section-heading__copy"><h2 class="section-title">{{ editingId ? '编辑分类' : '新建分类' }}</h2><p>{{ editingId ? '修改后立即同步到所有关联条目' : '创建一个新的保险箱索引' }}</p></div></div>
          <label><span class="field-label">名称</span><input v-model="name" class="input" maxlength="40" placeholder="例如：工作、社交、邮箱" /></label>
          <label><span class="field-label">标识颜色</span><span class="color-picker"><input v-model="color" class="color-input" type="color" /><span class="mono text-sm">{{ color.toUpperCase() }}</span></span></label>
          <div class="editor-actions"><button class="btn-primary" type="button" :disabled="saving" @click="save"><AppIcon name="check" :size="18" />{{ saving ? '保存中…' : editingId ? '保存修改' : '创建分类' }}</button><button v-if="editingId" class="btn-ghost" type="button" @click="clearForm">取消编辑</button></div>
          <div class="notice-panel"><AppIcon name="info" :size="18" /><span class="text-sm">删除分类不会删除其中的条目，它们会自动变为“未分类”。</span></div>
        </section>

        <section class="card category-list stack">
          <div class="section-heading"><div class="section-heading__copy"><h2 class="section-title">已有分类</h2><p>共 {{ vault.categories.length }} 个分类，可调整显示顺序</p></div><span class="status-pill">{{ vault.categories.length }}</span></div>
          <div v-if="vault.categories.length === 0" class="empty-state"><span class="empty-state__icon"><AppIcon name="folder" :size="28" /></span><strong>还没有分类</strong><p>在左侧创建第一个分类，让保险箱更容易浏览。</p></div>
          <div v-for="(category, index) in vault.categories" :key="category.id" class="category-row">
            <span class="category-index mono">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="category-dot" :style="{ background: category.color || 'var(--color-primary)', color: category.color || 'var(--color-primary)' }" />
            <span class="grow category-name">{{ category.name }}</span>
            <div class="category-actions">
              <button class="btn-icon" type="button" :disabled="index === 0" aria-label="上移" @click="move(category.id, -1)"><AppIcon name="up" :size="17" /></button>
              <button class="btn-icon" type="button" :disabled="index === vault.categories.length - 1" aria-label="下移" @click="move(category.id, 1)"><AppIcon name="down" :size="17" /></button>
              <button class="btn-icon" type="button" aria-label="编辑分类" @click="beginEdit(category.id)"><AppIcon name="edit" :size="17" /></button>
              <button class="btn-icon danger-icon" type="button" aria-label="删除分类" @click="remove(category.id, category.name)"><AppIcon name="trash" :size="17" /></button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.category-layout { display: grid; grid-template-columns: minmax(280px, .8fr) minmax(0, 1.2fr); gap: 20px; align-items: start; }
.category-editor { position: sticky; top: 24px; }
.editor-preview { display: flex; align-items: center; gap: 13px; padding: 15px; border: 1px solid color-mix(in srgb, var(--preview-color) 28%, var(--color-border)); border-radius: 16px; background: color-mix(in srgb, var(--preview-color) 8%, var(--color-surface-elevated)); }
.editor-preview__mark { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 15px; background: color-mix(in srgb, var(--preview-color) 18%, transparent); color: var(--preview-color); }
.editor-preview div { display: grid; gap: 3px; }.editor-preview strong { font-size: 17px; }
.color-picker { min-height: var(--control-height); display: flex; align-items: center; gap: 12px; padding: 5px 12px 5px 5px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-bg-soft); }
.color-input { width: 50px; height: 38px; padding: 2px; border: 0; border-radius: 10px; background: transparent; cursor: pointer; }
.editor-actions { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.category-row { display: flex; align-items: center; gap: 11px; min-height: 64px; padding: 9px 0; border-bottom: 1px solid var(--color-border); }
.category-row:last-child { border-bottom: 0; }
.category-index { color: var(--color-text-muted); font-size: 12px; }.category-dot { width: 12px; height: 12px; flex: 0 0 auto; border-radius: 50%; box-shadow: 0 0 0 5px color-mix(in srgb, currentColor 8%, transparent); }
.category-name { font-weight: 680; }.category-actions { display: flex; gap: 5px; }.category-actions .btn-icon { width: 44px; min-width: 44px; min-height: 44px; }.danger-icon { color: var(--color-danger); }
.empty-state { min-height: 240px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; color: var(--color-text-secondary); }.empty-state p { max-width: 280px; color: var(--color-text-muted); font-size: 12px; line-height: 1.6; }.empty-state__icon { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 19px; background: var(--color-primary-soft); color: var(--color-primary); }
@media (max-width: 860px) { .category-layout { grid-template-columns: 1fr; } .category-editor { position: static; } }
@media (max-width: 560px) { .category-row { align-items: flex-start; flex-wrap: wrap; } .category-name { padding-top: 10px; } .category-actions { width: 100%; justify-content: flex-end; padding-left: 35px; } .editor-actions { grid-template-columns: 1fr; } }
</style>
