<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { goBackOr } from '@/services/navigation/goBack'
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
      confirmButtonColor: '#e11d48',
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
        <button class="btn-icon page-back" type="button" aria-label="返回" @click="goBackOr('/vault')"><AppIcon name="back" /></button>
        <button v-if="entry" class="btn-primary" type="button" @click="router.push(`/vault/${id}/edit`)"><AppIcon name="edit" :size="18" />编辑条目</button>
      </header>

      <section v-if="!entry" class="card missing-state"><span><AppIcon name="info" :size="30" /></span><h1 class="text-xl">条目不存在</h1><p class="text-muted text-sm">它可能已经被删除，或当前链接已经失效。</p><button class="btn-primary" type="button" @click="router.replace('/vault')">返回保险箱</button></section>

      <template v-else>
        <div class="entry-hero">
          <span class="hero-avatar">{{ entry.title.slice(0, 1).toUpperCase() }}</span>
          <div class="grow hero-copy"><div class="cluster"><span class="eyebrow">保险箱记录</span><span v-if="entry.favorite" class="favorite-pill"><AppIcon name="star" :size="13" />收藏</span></div><h1>{{ entry.title }}</h1><div class="hero-meta"><span><span class="category-dot" :style="{ background: category?.color || 'var(--color-text-muted)' }" />{{ category?.name || '未分类' }}</span><span v-if="entry.totp.length"><AppIcon name="shield" :size="14" />已启用 2FA</span><span><AppIcon name="timer" :size="14" />{{ formatTime(entry.lastUsedAt) }}</span></div></div>
        </div>

        <div class="detail-layout">
          <main class="detail-main stack">
            <section class="card detail-card">
              <div class="section-heading"><div class="section-heading__copy"><h2 class="section-title">登录信息</h2><p>点按对应内容即可执行复制或打开操作</p></div><span class="section-mark"><AppIcon name="key" /></span></div>
              <div class="info-row"><span class="info-row__icon"><AppIcon name="globe" :size="18" /></span><span class="info-row__copy"><small>网址</small><strong>{{ entry.url || '未填写' }}</strong></span><button class="row-action" type="button" :disabled="!entry.url" @click="openUrl"><AppIcon name="globe" :size="17" />打开</button></div>
              <div class="info-row"><span class="info-row__icon"><AppIcon name="user" :size="18" /></span><span class="info-row__copy"><small>账号</small><strong>{{ entry.username || '未填写' }}</strong></span><button class="row-action" type="button" :disabled="!entry.username" @click="copy(entry.username, '账号')"><AppIcon name="copy" :size="17" />复制</button></div>
              <div class="info-row"><span class="info-row__icon"><AppIcon name="lock" :size="18" /></span><span class="info-row__copy"><small>密码</small><strong class="mono password-mask">{{ entry.password ? '••••••••••••' : '未填写' }}</strong></span><button class="row-action" type="button" :disabled="!entry.password" @click="copy(entry.password, '密码')"><AppIcon name="copy" :size="17" />复制</button></div>
              <div class="notes-block"><span class="info-row__icon"><AppIcon name="note" :size="18" /></span><div><small>备注</small><p class="notes">{{ entry.notes || '暂无备注' }}</p></div></div>
            </section>

            <section v-if="entry.totp.length" class="card detail-card">
              <div class="section-heading"><div class="section-heading__copy"><h2 class="section-title">2FA 验证码</h2><p>验证码只在当前设备生成，点按代码即可复制</p></div><span class="section-mark section-mark--safe"><AppIcon name="shield" /></span></div>
              <div class="totp-grid">
                <article v-for="item in entry.totp" :key="item.id" class="totp-card">
                  <div class="split"><div><strong>{{ item.label || item.issuer || 'TOTP' }}</strong><p class="text-muted text-xs">{{ totpMeta(item) }}</p></div><span class="countdown mono">{{ codes[item.id]?.remaining ?? item.period }}s</span></div>
                  <button v-if="!isTotpVisible(item.id)" class="totp-code masked" type="button" @click="revealTotp(item.id)"><AppIcon name="eye" :size="19" />点按显示</button>
                  <button v-else class="totp-code mono" type="button" @click="copy(codes[item.id]?.code, '验证码')">{{ codes[item.id]?.code || '······' }}</button>
                  <span class="totp-progress"><span :style="{ width: `${Math.max(0, Math.min(100, ((codes[item.id]?.remaining ?? item.period) / item.period) * 100))}%` }" /></span>
                </article>
              </div>
            </section>

            <section v-if="entry.customFields.length" class="card detail-card">
              <div class="section-heading"><div class="section-heading__copy"><h2 class="section-title">自定义字段</h2><p>附加的恢复信息和安全资料</p></div><span class="section-mark"><AppIcon name="note" /></span></div>
              <div v-for="field in entry.customFields" :key="field.id" class="info-row"><span class="info-row__icon"><AppIcon :name="field.masked ? 'lock' : 'file'" :size="18" /></span><span class="info-row__copy"><small>{{ field.name }}</small><strong class="mono">{{ field.masked && !revealedFields.has(field.id) ? '••••••••' : field.value || '未填写' }}</strong></span><button v-if="field.masked" class="row-action row-action--icon" type="button" :aria-label="revealedFields.has(field.id) ? '隐藏字段' : '显示字段'" @click="toggleField(field.id)"><AppIcon :name="revealedFields.has(field.id) ? 'eyeOff' : 'eye'" :size="17" /></button><button class="row-action" type="button" :disabled="!field.value" @click="copy(field.value, field.name)"><AppIcon name="copy" :size="17" />复制</button></div>
            </section>

            <section v-if="entry.linkedEmails.length" class="card detail-card">
              <div class="section-heading"><div class="section-heading__copy"><h2 class="section-title">绑定邮箱</h2><p>与当前登录身份关联的邮箱记录</p></div><span class="section-mark"><AppIcon name="mail" /></span></div>
              <div v-for="(link, index) in entry.linkedEmails" :key="index" class="info-row"><span class="info-row__icon"><AppIcon name="mail" :size="18" /></span><span class="info-row__copy"><small>{{ link.kind === 'entry' ? '保险箱条目' : '邮箱地址' }}</small><strong>{{ link.kind === 'entry' ? link.labelSnapshot : link.email }}</strong><span v-if="link.kind === 'entry' ? link.emailSnapshot : link.note" class="text-muted text-xs">{{ link.kind === 'entry' ? link.emailSnapshot : link.note }}</span></span><button v-if="link.kind === 'entry'" class="row-action" type="button" @click="router.push(`/vault/${link.entryId}`)">查看<AppIcon name="chevron" :size="16" /></button><button v-else class="row-action" type="button" @click="copy(link.email, '邮箱')"><AppIcon name="copy" :size="17" />复制</button></div>
            </section>

            <section v-if="references.length" class="card detail-card">
              <div class="section-heading"><div class="section-heading__copy"><h2 class="section-title">被以下条目引用</h2><p>这些记录保存了指向当前条目的关联</p></div></div>
              <button v-for="item in references" :key="item.id" class="reference-link" type="button" @click="router.push(`/vault/${item.id}`)"><span class="reference-avatar">{{ item.title.slice(0, 1).toUpperCase() }}</span><strong class="grow">{{ item.title }}</strong><AppIcon name="chevron" :size="17" /></button>
            </section>
          </main>

          <aside class="detail-aside stack">
            <section class="card metadata-card">
              <div class="section-heading"><div class="section-heading__copy"><h2 class="section-title">记录信息</h2><p>此条目的本地活动时间</p></div></div>
              <dl><div><dt>创建时间</dt><dd>{{ formatTime(entry.createdAt) }}</dd></div><div><dt>更新时间</dt><dd>{{ formatTime(entry.updatedAt) }}</dd></div><div><dt>最近使用</dt><dd>{{ formatTime(entry.lastUsedAt) }}</dd></div></dl>
            </section>
            <section class="card local-card"><AppIcon name="shield" :size="23" /><div><strong>内容仅在本机解密</strong><p>离开或锁定后，敏感显示状态会立即清除。</p></div></section>
            <section class="card danger-zone"><span class="eyebrow danger-text">危险区域</span><h2 class="section-title">删除此条目</h2><p>引用关系将保留文本快照，条目只能通过备份恢复。</p><button class="btn-danger" type="button" @click="removeEntry"><AppIcon name="trash" :size="18" />删除条目</button></section>
          </aside>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.missing-state { min-height: 360px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; }.missing-state > span { width: 62px; height: 62px; display: grid; place-items: center; border-radius: 20px; background: var(--color-primary-soft); color: var(--color-primary); }
.entry-hero { display: flex; align-items: center; gap: 20px; padding: 14px 4px 24px; border-bottom: 1px solid var(--color-border); }.hero-avatar { width: 74px; height: 74px; display: grid; place-items: center; flex: 0 0 auto; border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent); border-radius: 24px; background: linear-gradient(145deg, var(--color-primary-soft), var(--color-surface)); color: var(--color-primary); font-size: 29px; font-weight: 850; box-shadow: inset 0 1px 0 var(--color-border-strong); }.hero-copy { display: grid; gap: 8px; }.hero-copy h1 { font-size: clamp(27px, 4vw, 38px); line-height: 1.1; letter-spacing: -.04em; }.eyebrow { color: var(--color-primary); font-size: 12px; font-weight: 800; letter-spacing: .13em; }.favorite-pill { display: inline-flex; align-items: center; gap: 4px; color: var(--color-warning); font-size: 12px; font-weight: 750; }.hero-meta { display: flex; flex-wrap: wrap; gap: 8px 16px; color: var(--color-text-muted); font-size: 12px; }.hero-meta > span { display: flex; align-items: center; gap: 6px; }.category-dot { width: 7px; height: 7px; border-radius: 50%; }
.detail-layout { display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 20px; align-items: start; }.detail-card { display: grid; gap: 4px; }.section-mark { width: 40px; height: 40px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 13px; background: var(--color-primary-soft); color: var(--color-primary); }.section-mark--safe { color: var(--color-success); background: color-mix(in srgb, var(--color-success) 11%, transparent); }
.info-row { min-height: 68px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--color-border); }.info-row:last-child { border-bottom: 0; }.info-row__icon { width: 36px; height: 36px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 11px; background: var(--color-surface-elevated); color: var(--color-text-muted); }.info-row__copy { min-width: 0; flex: 1; display: grid; gap: 3px; overflow-wrap: anywhere; }.info-row__copy small, .notes-block small { color: var(--color-text-muted); font-size: 12px; }.info-row__copy strong { font-size: 13px; font-weight: 650; }.password-mask { letter-spacing: .16em; color: var(--color-text-secondary); }.row-action { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border: 1px solid var(--color-border); border-radius: 11px; background: transparent; color: var(--color-text-secondary); font-size: 12px; font-weight: 700; cursor: pointer; }.row-action:hover { color: var(--color-primary); border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border)); }.row-action--icon { width: 44px; padding: 0; }.notes-block { display: grid; grid-template-columns: auto 1fr; gap: 12px; padding: 14px 0 4px; }.notes { margin-top: 6px; white-space: pre-wrap; color: var(--color-text-secondary); font-size: 13px; line-height: 1.7; user-select: text; }
.totp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 8px; }.totp-card { position: relative; display: flex; flex-direction: column; gap: 12px; padding: 15px; overflow: hidden; border: 1px solid var(--color-border); border-radius: 16px; background: var(--color-bg-soft); }.totp-card strong { font-size: 13px; }.countdown { color: var(--color-text-muted); font-size: 12px; }.totp-code { min-height: 58px; border: 1px solid var(--color-border); border-radius: 13px; background: var(--color-surface); color: var(--color-primary); font-size: clamp(24px, 4vw, 30px); font-weight: 820; letter-spacing: .13em; cursor: pointer; }.totp-code.masked { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--color-text-secondary); font-family: var(--font-family); font-size: 13px; letter-spacing: normal; }.totp-progress { position: absolute; inset: auto 0 0; height: 3px; background: var(--color-border); }.totp-progress span { display: block; height: 100%; background: var(--color-success); transition: width 1s linear; }
.reference-link { min-height: 58px; display: flex; align-items: center; gap: 10px; border: 0; border-bottom: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted); text-align: left; cursor: pointer; }.reference-link:last-child { border-bottom: 0; }.reference-link strong { color: var(--color-text); font-size: 13px; }.reference-avatar { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 11px; background: var(--color-primary-soft); color: var(--color-primary); font-size: 12px; font-weight: 800; }
.metadata-card dl { display: grid; gap: 0; margin: 6px 0 0; }.metadata-card dl div { display: grid; gap: 5px; padding: 12px 0; border-bottom: 1px solid var(--color-border); }.metadata-card dl div:last-child { border-bottom: 0; }.metadata-card dt { color: var(--color-text-muted); font-size: 12px; }.metadata-card dd { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.5; }.local-card { display: flex; align-items: flex-start; gap: 11px; color: var(--color-success); }.local-card div { display: grid; gap: 4px; }.local-card strong { color: var(--color-text-secondary); font-size: 12px; }.local-card p, .danger-zone p { color: var(--color-text-muted); font-size: 12px; line-height: 1.6; }.danger-zone { display: flex; flex-direction: column; gap: 10px; border-color: color-mix(in srgb, var(--color-danger) 20%, var(--color-border)); }
@media (max-width: 940px) { .detail-layout { grid-template-columns: 1fr; }.detail-aside { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }.metadata-card { grid-row: span 2; } }
@media (max-width: 620px) { .entry-hero { align-items: flex-start; }.hero-avatar { width: 58px; height: 58px; border-radius: 18px; font-size: 23px; }.totp-grid, .detail-aside { grid-template-columns: 1fr; }.metadata-card { grid-row: auto; }.info-row { flex-wrap: wrap; padding: 10px 0; }.info-row__copy { flex-basis: calc(100% - 50px); }.row-action { margin-left: 48px; }.row-action + .row-action { margin-left: 0; } }
</style>
