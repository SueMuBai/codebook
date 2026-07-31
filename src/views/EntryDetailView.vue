<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { generateTotp } from '@/features/totp'
import { openExternalUrl } from '@/services/platform/openUrl'
import { useSessionStore } from '@/stores/session'
import { useVaultStore } from '@/stores/vault'
import { copyText } from '@/utils/clipboard'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const vault = useVaultStore()
const id = computed(() => String(route.params.id))
const entry = computed(() => vault.getEntry(id.value))
const category = computed(() => vault.getCategory(entry.value?.categoryId))
const references = computed(() => (entry.value ? vault.referencing(entry.value.id) : []))

const codes = reactive<Record<string, { code: string; remaining: number }>>({})
const revealedTotp = ref<Set<string>>(new Set())
const revealedFields = ref<Set<string>>(new Set())
const revealTimers = new Map<string, ReturnType<typeof setTimeout>>()
let ticker: ReturnType<typeof setInterval> | null = null

function clearSensitiveState() {
  if (ticker) clearInterval(ticker)
  ticker = null
  for (const timer of revealTimers.values()) clearTimeout(timer)
  revealTimers.clear()
  revealedTotp.value = new Set()
  revealedFields.value = new Set()
  for (const key of Object.keys(codes)) delete codes[key]
}

function isTotpVisible(totpId: string): boolean {
  return session.settings.totpRevealSeconds === 0 || revealedTotp.value.has(totpId)
}

async function refreshCodes() {
  for (const item of entry.value?.totp ?? []) {
    if (!isTotpVisible(item.id)) {
      delete codes[item.id]
      continue
    }
    try {
      const result = await generateTotp({
        secretBase32: item.secret,
        digits: item.digits,
        period: item.period,
        algorithm: item.algorithm,
      })
      codes[item.id] = { code: result.code, remaining: result.remainingSec }
    } catch {
      codes[item.id] = { code: '无效', remaining: 0 }
    }
  }
}

function revealTotp(idValue: string) {
  if (session.settings.totpRevealSeconds === 0) return
  const next = new Set(revealedTotp.value)
  next.add(idValue)
  revealedTotp.value = next
  const old = revealTimers.get(idValue)
  if (old) clearTimeout(old)
  revealTimers.set(idValue, setTimeout(() => {
    const hidden = new Set(revealedTotp.value)
    hidden.delete(idValue)
    revealedTotp.value = hidden
    delete codes[idValue]
    revealTimers.delete(idValue)
  }, session.settings.totpRevealSeconds * 1000))
  void refreshCodes()
}

function toggleField(idValue: string) {
  const next = new Set(revealedFields.value)
  if (next.has(idValue)) next.delete(idValue)
  else next.add(idValue)
  revealedFields.value = next
}

async function copy(value: string | undefined, label: string) {
  if (!value) return
  try {
    await copyText(value, session.settings.clipboardClearSeconds)
    session.touchActivity()
    showToast(`已复制${label}`)
    void vault.markEntryUsed(id.value).catch(() => undefined)
  } catch {
    showToast('复制失败')
  }
}

async function openUrl() {
  if (!entry.value?.url) return
  try {
    await openExternalUrl(entry.value.url)
    session.touchActivity()
    void vault.markEntryUsed(id.value).catch(() => undefined)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '打开网址失败')
  }
}

function formatTime(value: number | undefined): string {
  return value === undefined ? '尚未记录' : new Date(value).toLocaleString('zh-CN')
}

function totpMeta(item: NonNullable<typeof entry.value>['totp'][number]): string {
  const identity = [item.issuer, item.accountName].filter(Boolean).join(' · ')
  return identity || `${item.algorithm} · ${item.period}s`
}

async function removeEntry() {
  try {
    await showConfirmDialog({
      title: '删除条目',
      message: '引用它的邮箱关联会转换为文本快照。删除后只能通过备份恢复。',
      confirmButtonText: '删除',
      confirmButtonColor: '#d84f61',
    })
    await vault.deleteEntry(id.value)
    showToast('条目已删除')
    await router.replace('/vault')
  } catch {
    // cancelled
  }
}

onMounted(() => {
  void refreshCodes()
  ticker = setInterval(() => void refreshCodes(), 1_000)
})

onUnmounted(() => {
  clearSensitiveState()
})

watch(
  () => session.isUnlocked,
  (unlocked) => {
    if (!unlocked) {
      clearSensitiveState()
      void router.replace('/lock')
    }
  },
  { flush: 'sync' },
)
</script>

<template>
  <div class="app-page">
    <div class="page-content stack">
      <header class="page-header">
        <button class="btn-ghost" type="button" @click="router.back()">返回</button>
        <div class="cluster">
          <button class="btn-ghost" type="button" @click="router.push(`/vault/${id}/edit`)">编辑</button>
          <button class="btn-danger" type="button" @click="removeEntry">删除</button>
        </div>
      </header>

      <section v-if="!entry" class="card stack"><h1 class="text-xl">条目不存在</h1><button class="btn-primary" @click="router.replace('/vault')">返回保险箱</button></section>

      <template v-else>
        <div class="entry-hero">
          <span class="hero-avatar">{{ entry.title.slice(0, 1).toUpperCase() }}</span>
          <div class="grow"><h1 class="text-xl"><span v-if="entry.favorite" class="favorite">★ </span>{{ entry.title }}</h1><p class="text-muted text-sm">{{ category?.name || '未分类' }}</p></div>
        </div>

        <section class="card stack">
          <h2 class="section-title">登录信息</h2>
          <div class="detail-row"><span class="detail-label">网址</span><button class="value-button" :disabled="!entry.url" @click="openUrl">{{ entry.url || '—' }}</button></div>
          <div class="detail-row"><span class="detail-label">账号</span><button class="value-button" @click="copy(entry.username, '账号')">{{ entry.username || '—' }}</button></div>
          <div class="detail-row"><span class="detail-label">密码</span><button class="value-button mono" @click="copy(entry.password, '密码')">{{ entry.password ? '••••••••  点按复制' : '—' }}</button></div>
          <div class="detail-row detail-row--column"><span class="detail-label">备注</span><p class="notes">{{ entry.notes || '—' }}</p></div>
        </section>

        <section class="card stack metadata-card">
          <h2 class="section-title">记录信息</h2>
          <div class="detail-row"><span class="detail-label">创建</span><span class="grow text-right text-sm">{{ formatTime(entry.createdAt) }}</span></div>
          <div class="detail-row"><span class="detail-label">更新</span><span class="grow text-right text-sm">{{ formatTime(entry.updatedAt) }}</span></div>
          <div class="detail-row"><span class="detail-label">最近使用</span><span class="grow text-right text-sm">{{ formatTime(entry.lastUsedAt) }}</span></div>
        </section>

        <section v-if="entry.customFields.length" class="card stack">
          <h2 class="section-title">自定义字段</h2>
          <div v-for="field in entry.customFields" :key="field.id" class="detail-row">
            <span class="detail-label">{{ field.name }}</span>
            <div class="cluster grow justify-end">
              <button v-if="field.masked" class="btn-icon" @click="toggleField(field.id)">{{ revealedFields.has(field.id) ? '藏' : '显' }}</button>
              <button class="value-button mono" @click="copy(field.value, field.name)">{{ field.masked && !revealedFields.has(field.id) ? '••••••••' : field.value || '—' }}</button>
            </div>
          </div>
        </section>

        <section v-if="entry.totp.length" class="card stack">
          <h2 class="section-title">2FA 验证码</h2>
          <article v-for="item in entry.totp" :key="item.id" class="totp-card">
            <div class="split"><div><strong>{{ item.label || item.issuer || 'TOTP' }}</strong><p class="text-muted text-xs">{{ totpMeta(item) }}</p></div><span class="text-muted text-sm">{{ codes[item.id]?.remaining ?? item.period }}s</span></div>
            <button v-if="!isTotpVisible(item.id)" class="totp-code masked" @click="revealTotp(item.id)">点按显示</button>
            <button v-else class="totp-code mono" @click="copy(codes[item.id]?.code, '验证码')">{{ codes[item.id]?.code || '······' }}</button>
          </article>
        </section>

        <section v-if="entry.linkedEmails.length" class="card stack">
          <h2 class="section-title">绑定邮箱</h2>
          <div v-for="(link, index) in entry.linkedEmails" :key="index" class="detail-row">
            <template v-if="link.kind === 'entry'"><button class="value-button" @click="router.push(`/vault/${link.entryId}`)">{{ link.labelSnapshot }}<span v-if="link.emailSnapshot" class="text-muted"> · {{ link.emailSnapshot }}</span></button></template>
            <template v-else><button class="value-button" @click="copy(link.email, '邮箱')">{{ link.email }}<span v-if="link.note" class="text-muted"> · {{ link.note }}</span></button></template>
          </div>
        </section>

        <section v-if="references.length" class="card stack">
          <h2 class="section-title">被以下条目引用</h2>
          <button v-for="item in references" :key="item.id" class="reference-link" @click="router.push(`/vault/${item.id}`)">{{ item.title }}<span>›</span></button>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.entry-hero { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-2) 0 var(--space-3); }
.hero-avatar { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 18px; background: color-mix(in srgb, var(--color-primary) 16%, var(--color-surface)); color: var(--color-primary); font-size: 24px; font-weight: 800; }
.favorite { color: var(--color-warning); }
.detail-row { display: flex; align-items: center; gap: var(--space-3); min-height: 44px; border-bottom: 1px solid var(--color-border); }
.detail-row:last-child { border-bottom: 0; }
.detail-row--column { align-items: flex-start; flex-direction: column; padding: var(--space-2) 0; }
.detail-label { flex: 0 0 76px; color: var(--color-text-muted); font-size: var(--font-size-sm); }
.value-button { flex: 1; min-width: 0; padding: 10px 0; border: 0; background: transparent; color: var(--color-text); text-align: right; overflow-wrap: anywhere; }
.value-button:disabled { opacity: 1; }
.notes { width: 100%; white-space: pre-wrap; line-height: 1.65; user-select: text; }
.text-right { text-align: right; }
.justify-end { justify-content: flex-end; }
.totp-card { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-3); border-radius: var(--radius-sm); background: var(--color-bg-soft); }
.totp-code { min-height: 54px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-primary); font-size: 28px; font-weight: 800; letter-spacing: 0.15em; }
.totp-code.masked { color: var(--color-text-secondary); font-size: var(--font-size-md); letter-spacing: normal; }
.reference-link { min-height: 44px; display: flex; align-items: center; justify-content: space-between; border: 0; border-bottom: 1px solid var(--color-border); background: transparent; color: inherit; }
</style>
