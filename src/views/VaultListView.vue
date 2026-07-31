<script setup lang="ts">
import { computed, onActivated, ref } from 'vue'
import { useRouter } from 'vue-router'
import { UNCATEGORIZED_FILTER } from '@/features/credentials'
import { useSessionStore } from '@/stores/session'
import { useVaultStore } from '@/stores/vault'

const router = useRouter()
const session = useSessionStore()
const vault = useVaultStore()
const query = ref('')
const categoryFilter = ref<string | null>(null)
let seenLockEpoch = session.lockEpoch

// Search and filter survive in-app navigation (keep-alive), but a fresh
// unlock should present a fresh list, not last session's leftovers.
onActivated(() => {
  if (session.lockEpoch === seenLockEpoch) return
  seenLockEpoch = session.lockEpoch
  query.value = ''
  categoryFilter.value = null
})

const entries = computed(() => vault.listEntries(query.value, categoryFilter.value))
const favoriteCount = computed(() => vault.entries.filter((entry) => entry.favorite).length)
const totpCount = computed(() => vault.entries.filter((entry) => entry.totp.length > 0).length)

function openEntry(id: string) {
  void router.push(`/vault/${id}`)
}
</script>

<template>
  <div class="app-page app-page--with-nav">
    <div class="page-content">
      <header class="vault-header">
        <div class="page-header__title">
          <p class="eyebrow">YOUR CODEBOOK</p>
          <h1 class="text-xl">保险箱</h1>
          <p class="text-muted text-sm">所有凭据均在本机加密保存</p>
        </div>
        <button class="btn-primary" type="button" @click="router.push('/vault/new')"><AppIcon name="plus" :size="18" />新建条目</button>
      </header>

      <section class="vault-overview">
        <div class="overview-stat"><span><AppIcon name="vault" /></span><div><strong>{{ vault.entries.length }}</strong><small>全部记录</small></div></div>
        <div class="overview-stat"><span><AppIcon name="star" /></span><div><strong>{{ favoriteCount }}</strong><small>收藏条目</small></div></div>
        <div class="overview-stat"><span><AppIcon name="shield" /></span><div><strong>{{ totpCount }}</strong><small>启用 2FA</small></div></div>
      </section>

      <div class="stack search-area">
        <div class="search-input"><AppIcon name="search" :size="19" /><input v-model="query" class="input" type="search" placeholder="搜索标题、账号、网址或自定义字段" /></div>
        <div class="scroll-x" aria-label="分类筛选">
          <button class="chip" :class="{ 'is-active': categoryFilter === null }" @click="categoryFilter = null">全部</button>
          <button
            class="chip"
            :class="{ 'is-active': categoryFilter === UNCATEGORIZED_FILTER }"
            @click="categoryFilter = UNCATEGORIZED_FILTER"
          >未分类</button>
          <button
            v-for="category in vault.categories"
            :key="category.id"
            class="chip"
            :class="{ 'is-active': categoryFilter === category.id }"
            @click="categoryFilter = category.id"
          >
            <span class="category-dot" :style="{ background: category.color || 'var(--color-primary)' }" />
            {{ category.name }}
          </button>
          <button class="chip manage-chip" @click="router.push('/categories')"><AppIcon name="settings" :size="14" />管理分类</button>
        </div>
      </div>

      <section v-if="entries.length === 0" class="card empty stack">
        <div class="empty-icon" aria-hidden="true"><AppIcon :name="query ? 'search' : 'vault'" :size="30" /></div>
        <h2 class="text-lg">{{ query ? '没有匹配记录' : '保险箱还是空的' }}</h2>
        <p class="text-muted text-sm">{{ query ? '换个关键词或分类试试。' : '创建第一条记录，安全保存你的登录信息。' }}</p>
        <button v-if="!query" class="btn-primary" type="button" @click="router.push('/vault/new')"><AppIcon name="plus" :size="17" />新建第一条记录</button>
        <button v-else class="btn-ghost" type="button" @click="query = ''; categoryFilter = null">清除搜索和筛选</button>
      </section>

      <ul v-else class="entry-list">
        <li v-for="entry in entries" :key="entry.id">
          <button class="entry-card" type="button" @click="openEntry(entry.id)">
            <span class="entry-avatar">{{ entry.title.slice(0, 1).toUpperCase() }}</span>
            <span class="grow entry-copy">
              <span class="entry-title">
                <span v-if="entry.favorite" class="favorite">★</span>{{ entry.title }}
              </span>
              <span class="text-muted text-sm entry-subtitle">
                {{ entry.username || entry.url || vault.getCategory(entry.categoryId)?.name || '未填写账号信息' }}
              </span>
              <span class="entry-meta"><i :style="{ background: vault.getCategory(entry.categoryId)?.color || 'var(--color-text-muted)' }" />{{ vault.getCategory(entry.categoryId)?.name || '未分类' }}</span>
            </span>
            <span v-if="entry.totp.length" class="totp-badge"><AppIcon name="shield" :size="12" />{{ entry.totp.length }}×2FA</span>
            <span class="chevron"><AppIcon name="chevron" :size="18" /></span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.vault-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 22px; }
.vault-header h1 { margin-top: 4px; }
.search-area { margin-bottom: 18px; }
.vault-overview { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
.overview-stat { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 13px; border: 1px solid var(--color-border); border-radius: 17px; background: color-mix(in srgb, var(--color-surface) 80%, transparent); }
.overview-stat > span { flex: 0 0 38px; height: 38px; display: grid; place-items: center; border-radius: 12px; background: var(--color-primary-soft); color: var(--color-primary); }
.overview-stat div { display: grid; gap: 1px; }.overview-stat strong { font-size: 20px; letter-spacing: -.03em; }.overview-stat small { color: var(--color-text-muted); font-size: 12px; white-space: nowrap; }
.category-dot { width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.manage-chip { border-style: dashed; }
.empty { align-items: center; text-align: center; padding: 38px 24px; margin-top: 26px; }
.empty .btn-primary, .empty .btn-ghost { margin-top: 4px; }
.empty-icon { width: 64px; height: 64px; display: grid; place-items: center; border-radius: 20px; background: var(--color-primary-soft); color: var(--color-primary); }
.entry-list { display: grid; gap: 11px; }
.entry-card { width: 100%; display: flex; align-items: center; gap: 13px; min-height: 82px; padding: 14px; border: 1px solid var(--color-border); border-radius: 19px; background: color-mix(in srgb, var(--color-surface) 94%, transparent); color: inherit; text-align: left; box-shadow: 0 12px 36px rgba(0, 0, 0, .08); cursor: pointer; transition: transform var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast); }
.entry-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--color-primary) 28%, var(--color-border)); background: var(--color-surface-elevated); }
.entry-avatar { flex: 0 0 50px; width: 50px; height: 50px; display: grid; place-items: center; border-radius: 16px; background: linear-gradient(145deg, var(--color-primary-soft), color-mix(in srgb, var(--color-accent) 10%, var(--color-surface))); color: var(--color-primary); font-size: 17px; font-weight: 820; }
.entry-copy { display: flex; flex-direction: column; gap: 3px; overflow: hidden; }
.entry-title, .entry-subtitle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-title { font-weight: 700; }
.entry-meta { display: flex; align-items: center; gap: 5px; margin-top: 2px; color: var(--color-text-muted); font-size: 12px; }.entry-meta i { width: 6px; height: 6px; border-radius: 50%; }
.favorite { color: var(--color-warning); margin-right: 5px; }
.totp-badge { display: inline-flex; align-items: center; gap: 4px; padding: 5px 8px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--color-success) 10%, transparent); color: var(--color-success); font-size: 12px; font-weight: 720; white-space: nowrap; }
.chevron { color: var(--color-text-muted); }
@media (min-width: 980px) { .entry-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }.entry-card { min-height: 92px; } }
@media (max-width: 560px) { .vault-header { align-items: center; }.vault-header .btn-primary { width: 48px; padding: 0; font-size: 0; }.vault-overview { grid-template-columns: 1fr 1fr 1fr; }.overview-stat { justify-content: center; padding: 11px 6px; }.overview-stat > span { display: none; }.overview-stat div { text-align: center; }.totp-badge { padding: 5px; }.totp-badge .app-icon { display: none; } }
</style>
