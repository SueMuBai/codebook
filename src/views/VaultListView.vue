<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { UNCATEGORIZED_FILTER } from '@/features/credentials'
import { useVaultStore } from '@/stores/vault'

const router = useRouter()
const vault = useVaultStore()
const query = ref('')
const categoryFilter = ref<string | null>(null)

const entries = computed(() => vault.listEntries(query.value, categoryFilter.value))
const subtitle = computed(() => `${entries.value.length} 条记录`)

function openEntry(id: string) {
  void router.push(`/vault/${id}`)
}
</script>

<template>
  <div class="app-page app-page--with-nav">
    <div class="page-content">
      <header class="page-header">
        <div class="page-header__title">
          <h1 class="text-xl">保险箱</h1>
          <p class="text-muted text-sm">{{ subtitle }}</p>
        </div>
        <button class="btn-primary" type="button" @click="router.push('/vault/new')">新建</button>
      </header>

      <div class="stack search-area">
        <input
          v-model="query"
          class="input"
          type="search"
          placeholder="搜索标题、账号、网址、备注或自定义字段"
        />
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
          <button class="chip" @click="router.push('/categories')">管理分类</button>
        </div>
      </div>

      <section v-if="entries.length === 0" class="card empty stack">
        <div class="empty-icon" aria-hidden="true">◇</div>
        <h2 class="text-lg">{{ query ? '没有匹配记录' : '保险箱还是空的' }}</h2>
        <p class="text-muted text-sm">{{ query ? '换个关键词或分类试试。' : '创建第一条记录，安全保存你的登录信息。' }}</p>
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
            </span>
            <span v-if="entry.totp.length" class="totp-badge">{{ entry.totp.length }}×2FA</span>
            <span class="chevron">›</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.search-area { margin-bottom: var(--space-4); }
.category-dot { width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.empty { align-items: center; text-align: center; padding: var(--space-8); margin-top: var(--space-6); }
.empty-icon { font-size: 42px; color: var(--color-primary); }
.entry-list { display: flex; flex-direction: column; gap: var(--space-3); }
.entry-card { width: 100%; display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-card); background: var(--color-surface); color: inherit; text-align: left; box-shadow: var(--shadow-card); }
.entry-avatar { flex: 0 0 44px; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 14px; background: color-mix(in srgb, var(--color-primary) 15%, var(--color-bg-soft)); color: var(--color-primary); font-weight: 800; }
.entry-copy { display: flex; flex-direction: column; gap: 3px; overflow: hidden; }
.entry-title, .entry-subtitle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-title { font-weight: 700; }
.favorite { color: var(--color-warning); margin-right: 5px; }
.totp-badge { padding: 4px 8px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--color-primary) 13%, transparent); color: var(--color-primary); font-size: 11px; white-space: nowrap; }
.chevron { color: var(--color-text-muted); font-size: 23px; }
</style>
