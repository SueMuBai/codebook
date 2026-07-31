<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { goBackOr } from '@/services/navigation/goBack'
import { showConfirmDialog, showToast } from 'vant'
import { generatePassword } from '@/features/credentials'
import { totpFromManual, totpFromUri } from '@/features/totp'
import TotpScanSheet from '@/components/vault/TotpScanSheet.vue'
import { useSessionStore } from '@/stores/session'
import { useVaultStore } from '@/stores/vault'
import type {
  CredentialEntry,
  LinkedEmailRef,
  TotpAlgorithm,
  TotpDigits,
  TotpSecret,
} from '@/types/domain'
import { createId } from '@/utils/id'

const route = useRoute()
const router = useRouter()
const vault = useVaultStore()
const session = useSessionStore()
const isNew = computed(() => route.name === 'entry-new')
const routeId = computed(() => (typeof route.params.id === 'string' ? route.params.id : undefined))

const draft = reactive<CredentialEntry>({
  id: '',
  title: '',
  favorite: false,
  totp: [],
  linkedEmails: [],
  customFields: [],
  createdAt: 0,
  updatedAt: 0,
})
const initialSnapshot = ref('')
const saved = ref(false)
const saving = ref(false)
const showPassword = ref(false)
const showScanner = ref(false)
const titleInput = ref<HTMLInputElement | null>(null)
const expandedMethod = ref<'uri' | 'manual' | null>(null)

const totpUri = ref('')
const manualSecret = ref('')
const manualIssuer = ref('')
const manualAccount = ref('')
const manualLabel = ref('')
const manualDigits = ref<TotpDigits>(6)
const manualPeriod = ref(30)
const manualAlgorithm = ref<TotpAlgorithm>('SHA1')

const linkMode = ref<'text' | 'entry'>('text')
const linkEmail = ref('')
const linkNote = ref('')
const linkQuery = ref('')
const selectedEntryId = ref('')

const snapshot = computed(() => JSON.stringify(draft))
const dirty = computed(() => initialSnapshot.value !== '' && snapshot.value !== initialSnapshot.value)
const linkCandidates = computed(() => {
  const query = linkQuery.value.trim().toLocaleLowerCase('zh-CN')
  return vault.entries.filter((entry) => {
    if (entry.id === draft.id) return false
    if (!query) return true
    return [entry.title, entry.username, entry.url, entry.notes]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(query)
  })
})

onMounted(() => {
  if (!isNew.value && routeId.value) {
    const existing = vault.getEntry(routeId.value)
    if (!existing) {
      showToast('条目不存在')
      void router.replace('/vault')
      return
    }
    Object.assign(draft, cloneEntry(existing))
  }
  initialSnapshot.value = snapshot.value
})

onBeforeRouteLeave(async () => {
  if (!session.isUnlocked || !dirty.value || saved.value) return true
  try {
    await showConfirmDialog({ title: '放弃未保存修改？', message: '离开后当前草稿将丢失。', confirmButtonText: '放弃' })
    return true
  } catch {
    return false
  }
})

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= items.length) return
  ;[items[index], items[target]] = [items[target]!, items[index]!]
}

function addCustomField() {
  draft.customFields.push({ id: createId('field'), name: '', value: '', masked: false })
}

function removeCustomField(id: string) {
  draft.customFields = draft.customFields.filter((field) => field.id !== id)
}

function addTotp(item: TotpSecret) {
  draft.totp.push(item)
  showToast('TOTP 已加入草稿')
}

function addTotpUri() {
  try {
    addTotp(totpFromUri(totpUri.value))
    totpUri.value = ''
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'URI 无效')
  }
}

function addTotpManual() {
  try {
    addTotp(totpFromManual({
      secret: manualSecret.value,
      issuer: manualIssuer.value,
      accountName: manualAccount.value || draft.username,
      label: manualLabel.value,
      digits: manualDigits.value,
      period: manualPeriod.value,
      algorithm: manualAlgorithm.value,
    }))
    manualSecret.value = ''
    manualIssuer.value = ''
    manualAccount.value = ''
    manualLabel.value = ''
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'TOTP 参数无效')
  }
}

function addLinkedEmail() {
  try {
    let link: LinkedEmailRef
    if (linkMode.value === 'text') {
      const email = linkEmail.value.trim()
      if (!email || !email.includes('@')) throw new Error('请输入有效邮箱')
      link = { kind: 'text', email, note: linkNote.value.trim() || undefined }
      linkEmail.value = ''
      linkNote.value = ''
    } else {
      if (!selectedEntryId.value) throw new Error('请选择关联条目')
      link = vault.createEntryLink(selectedEntryId.value)
      selectedEntryId.value = ''
      linkQuery.value = ''
    }
    const duplicate = draft.linkedEmails.some((item) =>
      item.kind === 'entry' && link.kind === 'entry'
        ? item.entryId === link.entryId
        : item.kind === 'text' && link.kind === 'text' && item.email.toLowerCase() === link.email.toLowerCase(),
    )
    if (duplicate) throw new Error('该邮箱关联已存在')
    draft.linkedEmails.push(link)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '添加失败')
  }
}

async function save() {
  if (!draft.title.trim()) {
    showToast('请填写标题')
    titleInput.value?.focus()
    return
  }
  saving.value = true
  try {
    const entry = await vault.upsertEntry({ ...cloneEntry(draft), id: isNew.value ? undefined : draft.id })
    saved.value = true
    showToast('条目已保存')
    await router.replace(`/vault/${entry.id}`)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

function cloneEntry(value: CredentialEntry): CredentialEntry {
  return JSON.parse(JSON.stringify(value)) as CredentialEntry
}
</script>

<template>
  <div class="app-page">
    <div class="page-content stack">
      <header class="page-header sticky-header">
        <button class="btn-icon page-back" type="button" aria-label="取消并返回" @click="goBackOr('/vault')"><AppIcon name="close" /></button>
        <div class="page-header__title"><h1 class="text-xl">{{ isNew ? '新建条目' : '编辑条目' }}</h1><p class="text-muted text-sm">{{ dirty ? '有尚未保存的修改' : '所有字段均在本机加密保存' }}</p></div>
        <button class="btn-primary save-button" type="submit" form="entry-form" :disabled="saving"><AppIcon name="check" :size="18" />{{ saving ? '保存中…' : '保存' }}</button>
      </header>

      <form id="entry-form" class="entry-form stack" @submit.prevent="save">
        <section class="card editor-section">
          <div class="section-heading"><div class="section-heading__copy"><span class="section-kicker">01</span><h2 class="section-title">基本信息</h2><p>用于识别和登录服务的主要资料</p></div><span class="section-mark"><AppIcon name="key" /></span></div>
          <div class="form-grid">
            <label class="span-2"><span class="field-label">标题 *</span><input ref="titleInput" v-model="draft.title" class="input" maxlength="120" placeholder="网站或服务名称" /></label>
            <label><span class="field-label">分类</span><select v-model="draft.categoryId" class="select"><option :value="undefined">未分类</option><option v-for="category in vault.categories" :key="category.id" :value="category.id">{{ category.name }}</option></select></label>
            <label class="favorite-switch"><span><strong>收藏条目</strong><small>在保险箱顶部快速找到</small></span><input v-model="draft.favorite" type="checkbox" /></label>
            <label class="span-2"><span class="field-label">网址</span><span class="field-with-icon"><AppIcon name="globe" :size="18" /><input v-model="draft.url" class="input" inputmode="url" placeholder="https://example.com" /></span></label>
            <label><span class="field-label">账号</span><span class="field-with-icon"><AppIcon name="user" :size="18" /><input v-model="draft.username" class="input" autocomplete="off" placeholder="用户名、手机或邮箱" /></span></label>
            <label><span class="field-label">密码</span><div class="password-input"><input v-model="draft.password" class="input" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="输入或生成安全密码" /><button class="input-icon-action" type="button" :aria-label="showPassword ? '隐藏密码' : '显示密码'" @click="showPassword = !showPassword"><AppIcon :name="showPassword ? 'eyeOff' : 'eye'" :size="18" /></button><button class="generate-button" type="button" @click="draft.password = generatePassword()"><AppIcon name="key" :size="16" />生成</button></div></label>
            <label class="span-2"><span class="field-label">备注</span><textarea v-model="draft.notes" class="textarea" rows="4" placeholder="恢复信息、登录说明等" /></label>
          </div>
        </section>

        <section class="card editor-section">
          <div class="section-heading"><div class="section-heading__copy"><span class="section-kicker">02</span><h2 class="section-title">自定义字段</h2><p>保存安全问题、恢复码或其它敏感资料</p></div><button class="btn-ghost" type="button" @click="addCustomField"><AppIcon name="plus" :size="17" />添加字段</button></div>
          <div v-if="draft.customFields.length === 0" class="section-empty"><span><AppIcon name="note" :size="24" /></span><div><strong>暂无自定义字段</strong><p>需要更多资料时，可以添加名称和值。</p></div></div>
          <div class="nested-list">
            <article v-for="(field, index) in draft.customFields" :key="field.id" class="nested-card">
              <div class="nested-card__header"><span class="nested-index mono">{{ String(index + 1).padStart(2, '0') }}</span><strong class="grow">{{ field.name || '未命名字段' }}</strong><div class="nested-actions"><button class="btn-icon" type="button" :disabled="index === 0" aria-label="上移字段" @click="moveItem(draft.customFields, index, -1)"><AppIcon name="up" :size="16" /></button><button class="btn-icon" type="button" :disabled="index === draft.customFields.length - 1" aria-label="下移字段" @click="moveItem(draft.customFields, index, 1)"><AppIcon name="down" :size="16" /></button><button class="btn-icon danger-icon" type="button" aria-label="删除字段" @click="removeCustomField(field.id)"><AppIcon name="trash" :size="16" /></button></div></div>
              <div class="form-grid"><label><span class="field-label">字段名称</span><input v-model="field.name" class="input" placeholder="例如：恢复代码" /></label><label><span class="field-label">字段内容</span><input v-model="field.value" class="input" :type="field.masked ? 'password' : 'text'" autocomplete="new-password" placeholder="输入字段内容" /></label></div>
              <label class="compact-switch"><span><AppIcon :name="field.masked ? 'eyeOff' : 'eye'" :size="17" />遮罩显示</span><input v-model="field.masked" type="checkbox" /></label>
            </article>
          </div>
        </section>

        <section class="card editor-section">
          <div class="section-heading"><div class="section-heading__copy"><span class="section-kicker">03</span><h2 class="section-title">2FA（TOTP）</h2><p>推荐扫描服务提供的二维码，也支持 URI 与手工参数</p></div><button class="btn-primary" type="button" @click="showScanner = true"><AppIcon name="qr" :size="18" />扫描二维码</button></div>
          <div class="notice-panel"><AppIcon name="shield" :size="19" /><span class="text-sm">二维码和密钥只在本机解析，不会上传。添加后仍需保存整个条目。</span></div>
          <div class="nested-list">
            <article v-for="(totp, index) in draft.totp" :key="totp.id" class="nested-card">
              <div class="nested-card__header"><span class="totp-mark"><AppIcon name="shield" :size="18" /></span><strong class="grow">{{ totp.label || totp.issuer || totp.accountName || `TOTP ${index + 1}` }}</strong><div class="nested-actions"><button class="btn-icon" type="button" :disabled="index === 0" aria-label="上移 TOTP" @click="moveItem(draft.totp, index, -1)"><AppIcon name="up" :size="16" /></button><button class="btn-icon" type="button" :disabled="index === draft.totp.length - 1" aria-label="下移 TOTP" @click="moveItem(draft.totp, index, 1)"><AppIcon name="down" :size="16" /></button><button class="btn-icon danger-icon" type="button" aria-label="删除 TOTP" @click="draft.totp.splice(index, 1)"><AppIcon name="trash" :size="16" /></button></div></div>
              <div class="form-grid"><label><span class="field-label">标签</span><input v-model="totp.label" class="input" placeholder="例如：主账号" /></label><label><span class="field-label">Issuer</span><input v-model="totp.issuer" class="input" placeholder="服务提供方" /></label><label><span class="field-label">账号名</span><input v-model="totp.accountName" class="input" placeholder="对应账号" /></label><label><span class="field-label">Base32 Secret</span><input v-model="totp.secret" class="input mono" type="password" autocomplete="new-password" placeholder="密钥" /></label></div>
              <div class="parameter-grid"><label><span class="field-label">位数</span><select v-model.number="totp.digits" class="select"><option :value="6">6 位</option><option :value="7">7 位</option><option :value="8">8 位</option></select></label><label><span class="field-label">周期（秒）</span><input v-model.number="totp.period" class="input" type="number" min="1" max="300" /></label><label><span class="field-label">算法</span><select v-model="totp.algorithm" class="select"><option value="SHA1">SHA-1</option><option value="SHA256">SHA-256</option><option value="SHA512">SHA-512</option></select></label></div>
            </article>
          </div>
          <div class="add-methods">
            <div class="method-card" :class="{ 'is-open': expandedMethod === 'uri' }">
              <button class="method-card__title" type="button" :aria-expanded="expandedMethod === 'uri'" @click="expandedMethod = expandedMethod === 'uri' ? null : 'uri'"><span><AppIcon name="qr" :size="18" /></span><div><strong>粘贴 otpauth URI</strong><small>从其它验证器或服务复制</small></div><AppIcon name="chevron" :size="16" class="method-card__chevron" /></button>
              <template v-if="expandedMethod === 'uri'">
                <textarea v-model="totpUri" class="textarea mono" rows="2" placeholder="otpauth://totp/..." />
                <button class="btn-ghost" type="button" @click="addTotpUri">解析并添加</button>
              </template>
            </div>
            <div class="method-card" :class="{ 'is-open': expandedMethod === 'manual' }">
              <button class="method-card__title" type="button" :aria-expanded="expandedMethod === 'manual'" @click="expandedMethod = expandedMethod === 'manual' ? null : 'manual'"><span><AppIcon name="key" :size="18" /></span><div><strong>手工添加</strong><small>使用服务提供的 Base32 密钥</small></div><AppIcon name="chevron" :size="16" class="method-card__chevron" /></button>
              <template v-if="expandedMethod === 'manual'">
                <label><span class="field-label">Base32 Secret</span><input v-model="manualSecret" class="input mono" type="password" autocomplete="new-password" placeholder="输入密钥" /></label>
                <div class="form-grid"><label><span class="field-label">Issuer</span><input v-model="manualIssuer" class="input" placeholder="服务提供方" /></label><label><span class="field-label">账号名</span><input v-model="manualAccount" class="input" placeholder="对应账号" /></label></div>
                <label><span class="field-label">标签</span><input v-model="manualLabel" class="input" placeholder="例如：主账号" /></label>
                <div class="parameter-grid"><select v-model.number="manualDigits" class="select" aria-label="TOTP 位数"><option :value="6">6 位</option><option :value="7">7 位</option><option :value="8">8 位</option></select><input v-model.number="manualPeriod" class="input" aria-label="TOTP 周期" type="number" min="1" max="300" /><select v-model="manualAlgorithm" class="select" aria-label="TOTP 算法"><option value="SHA1">SHA-1</option><option value="SHA256">SHA-256</option><option value="SHA512">SHA-512</option></select></div>
                <button class="btn-ghost" type="button" @click="addTotpManual">添加 TOTP</button>
              </template>
            </div>
          </div>
        </section>

        <section class="card editor-section">
          <div class="section-heading"><div class="section-heading__copy"><span class="section-kicker">04</span><h2 class="section-title">绑定其它邮箱</h2><p>记录登录身份与恢复邮箱之间的关系</p></div><span class="section-mark"><AppIcon name="mail" /></span></div>
          <div v-if="draft.linkedEmails.length" class="linked-list"><div v-for="(link, index) in draft.linkedEmails" :key="`${link.kind}-${index}`" class="linked-row"><span class="linked-icon"><AppIcon name="mail" :size="18" /></span><span class="grow"><strong>{{ link.kind === 'entry' ? link.labelSnapshot : link.email }}</strong><small v-if="link.kind === 'entry' ? link.emailSnapshot : link.note">{{ link.kind === 'entry' ? link.emailSnapshot : link.note }}</small></span><button class="btn-icon danger-icon" type="button" aria-label="移除邮箱关联" @click="draft.linkedEmails.splice(index, 1)"><AppIcon name="trash" :size="16" /></button></div></div>
          <div class="link-builder"><div class="link-tabs"><button class="chip" type="button" :class="{ 'is-active': linkMode === 'text' }" @click="linkMode = 'text'"><AppIcon name="mail" :size="16" />手输邮箱</button><button class="chip" type="button" :class="{ 'is-active': linkMode === 'entry' }" @click="linkMode = 'entry'"><AppIcon name="vault" :size="16" />选择库内条目</button></div><div class="form-grid"><template v-if="linkMode === 'text'"><label><span class="field-label">邮箱地址</span><input v-model="linkEmail" class="input" inputmode="email" placeholder="foo@example.com" /></label><label><span class="field-label">备注（可选）</span><input v-model="linkNote" class="input" placeholder="例如：主要恢复邮箱" /></label></template><template v-else><label><span class="field-label">搜索条目</span><input v-model="linkQuery" class="input" placeholder="搜索标题、账号、网址或备注" /></label><label><span class="field-label">选择条目</span><select v-model="selectedEntryId" class="select"><option value="">选择条目</option><option v-for="entry in linkCandidates" :key="entry.id" :value="entry.id">{{ entry.title }}{{ entry.username ? ` · ${entry.username}` : '' }}</option></select></label></template></div><button class="btn-ghost add-link-button" type="button" @click="addLinkedEmail"><AppIcon name="plus" :size="17" />添加关联</button></div>
        </section>
      </form>

      <TotpScanSheet :show="showScanner" :account-name="draft.username" @close="showScanner = false" @confirm="addTotp" />
    </div>
  </div>
</template>

<style scoped>
.sticky-header { position: sticky; top: calc(-20px - var(--safe-top)); z-index: 20; padding: 13px 0; background: color-mix(in srgb, var(--color-bg) 90%, transparent); backdrop-filter: blur(18px); }.save-button { min-width: 110px; }
@media (min-width: 760px) { .sticky-header { top: -32px; } }
.editor-section { display: grid; gap: 20px; }.section-kicker { color: var(--color-primary); font-family: var(--font-mono); font-size: 12px; font-weight: 800; letter-spacing: .12em; }.section-mark { width: 44px; height: 44px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 14px; background: var(--color-primary-soft); color: var(--color-primary); }.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }.span-2 { grid-column: 1 / -1; }.field-with-icon { position: relative; display: block; }.field-with-icon > .app-icon { position: absolute; z-index: 1; left: 14px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); }.field-with-icon .input { padding-left: 43px; }
.favorite-switch, .compact-switch { min-height: var(--control-height); display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 13px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-bg-soft); }.favorite-switch span { display: grid; gap: 2px; }.favorite-switch strong { font-size: 12px; }.favorite-switch small { color: var(--color-text-muted); font-size: 12px; }.favorite-switch input, .compact-switch input { width: 22px; height: 22px; accent-color: var(--color-primary); }
.password-input { position: relative; display: flex; gap: 7px; }.password-input .input { min-width: 0; padding-right: 46px; }.input-icon-action { position: absolute; right: 83px; top: 3px; width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: transparent; color: var(--color-text-muted); cursor: pointer; }.generate-button { min-width: 76px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); background: var(--color-surface-elevated); color: var(--color-primary); font-size: 12px; font-weight: 750; cursor: pointer; }
.section-empty { min-height: 96px; display: flex; align-items: center; justify-content: center; gap: 13px; padding: 18px; border: 1px dashed var(--color-border-strong); border-radius: 15px; color: var(--color-text-secondary); }.section-empty > span { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 14px; background: var(--color-primary-soft); color: var(--color-primary); }.section-empty div { display: grid; gap: 4px; }.section-empty strong { font-size: 13px; }.section-empty p { color: var(--color-text-muted); font-size: 12px; }
.nested-list { display: grid; gap: 12px; }.nested-card { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--color-border); border-radius: 16px; background: var(--color-bg-soft); }.nested-card__header { display: flex; align-items: center; gap: 10px; }.nested-index { color: var(--color-text-muted); font-size: 12px; }.nested-card__header strong { font-size: 13px; }.nested-actions { display: flex; gap: 5px; }.nested-actions .btn-icon { width: 44px; min-width: 44px; min-height: 44px; }.danger-icon { color: var(--color-danger); }.compact-switch { justify-self: start; min-height: 44px; padding-block: 5px; color: var(--color-text-secondary); font-size: 12px; }.compact-switch span { display: flex; align-items: center; gap: 7px; }.compact-switch input { width: 22px; height: 22px; }.totp-mark { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 11px; background: color-mix(in srgb, var(--color-success) 11%, transparent); color: var(--color-success); }
.parameter-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }.add-methods { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }.method-card { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px dashed var(--color-border-strong); border-radius: 16px; background: color-mix(in srgb, var(--color-bg-soft) 60%, transparent); }.method-card.is-open { border-style: solid; }.method-card__title { display: flex; align-items: center; gap: 10px; margin: -16px; padding: 16px; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }.method-card.is-open .method-card__title { margin-bottom: -4px; }.method-card__title > span { width: 44px; height: 44px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 11px; background: var(--color-primary-soft); color: var(--color-primary); }.method-card__title div { flex: 1; display: grid; gap: 2px; }.method-card__title strong { font-size: 12px; }.method-card__title small { color: var(--color-text-muted); font-size: 12px; }.method-card__chevron { flex: 0 0 auto; color: var(--color-text-muted); transform: rotate(90deg); transition: transform var(--transition-fast); }.method-card.is-open .method-card__chevron { transform: rotate(-90deg); }.method-card .btn-ghost { align-self: flex-start; }
.linked-list { display: grid; }.linked-row { min-height: 60px; display: flex; align-items: center; gap: 11px; padding: 8px 0; border-bottom: 1px solid var(--color-border); }.linked-row:last-child { border-bottom: 0; }.linked-icon { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; background: var(--color-primary-soft); color: var(--color-primary); }.linked-row .grow { display: grid; gap: 3px; }.linked-row strong { font-size: 12px; }.linked-row small { color: var(--color-text-muted); font-size: 12px; }.link-builder { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--color-border); border-radius: 16px; background: var(--color-bg-soft); }.link-tabs { display: flex; gap: 7px; flex-wrap: wrap; }.add-link-button { justify-self: start; }
@media (max-width: 760px) { .add-methods { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .page-header__title p { display: none; }.save-button { min-width: auto; padding-inline: 12px; }.form-grid, .parameter-grid { grid-template-columns: 1fr; }.span-2 { grid-column: auto; }.section-heading { align-items: center; }.section-heading > .btn-primary, .section-heading > .btn-ghost { flex: 0 0 auto; padding-inline: 10px; }.nested-card { padding: 13px; }.nested-card__header { align-items: flex-start; flex-wrap: wrap; }.nested-card__header .grow { padding-top: 9px; }.nested-actions { width: 100%; justify-content: flex-end; }.method-card .btn-ghost, .add-link-button { width: 100%; }.password-input { display: grid; grid-template-columns: 1fr auto; }.password-input .input { grid-column: 1 / -1; }.input-icon-action { right: 8px; }.generate-button { min-height: 44px; grid-column: 2; }.favorite-switch { align-self: end; } }
</style>
