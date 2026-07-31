<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
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
        <button class="btn-ghost" type="button" @click="router.back()">取消</button>
        <div class="page-header__title"><h1 class="text-xl">{{ isNew ? '新建条目' : '编辑条目' }}</h1></div>
        <button class="btn-primary" type="button" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      </header>

      <form class="card stack" @submit.prevent="save">
        <h2 class="section-title">基本信息</h2>
        <label><span class="field-label">标题 *</span><input v-model="draft.title" class="input" maxlength="120" placeholder="网站或服务名称" /></label>
        <label><span class="field-label">分类</span><select v-model="draft.categoryId" class="select"><option :value="undefined">未分类</option><option v-for="category in vault.categories" :key="category.id" :value="category.id">{{ category.name }}</option></select></label>
        <label><span class="field-label">网址</span><input v-model="draft.url" class="input" inputmode="url" placeholder="https://example.com" /></label>
        <label><span class="field-label">账号</span><input v-model="draft.username" class="input" autocomplete="off" placeholder="用户名、手机或邮箱" /></label>
        <label>
          <span class="field-label">密码</span>
          <div class="input-actions">
            <input v-model="draft.password" class="input" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" />
            <button class="btn-icon" type="button" @click="showPassword = !showPassword">{{ showPassword ? '藏' : '显' }}</button>
            <button class="btn-ghost" type="button" @click="draft.password = generatePassword()">生成</button>
          </div>
        </label>
        <label><span class="field-label">备注</span><textarea v-model="draft.notes" class="textarea" rows="4" placeholder="恢复信息、登录说明等" /></label>
        <label class="switch-row"><span>收藏</span><input v-model="draft.favorite" type="checkbox" /></label>
      </form>

      <section class="card stack">
        <div class="split"><h2 class="section-title">自定义字段</h2><button class="btn-ghost" type="button" @click="addCustomField">添加字段</button></div>
        <p v-if="draft.customFields.length === 0" class="text-muted text-sm">可保存安全问题、恢复码或其它敏感信息。</p>
        <div v-for="(field, index) in draft.customFields" :key="field.id" class="nested-card stack">
          <div class="cluster">
            <button class="btn-icon" :disabled="index === 0" @click="moveItem(draft.customFields, index, -1)">↑</button>
            <button class="btn-icon" :disabled="index === draft.customFields.length - 1" @click="moveItem(draft.customFields, index, 1)">↓</button>
            <button class="btn-danger" @click="removeCustomField(field.id)">删除</button>
          </div>
          <input v-model="field.name" class="input" placeholder="字段名称" />
          <input v-model="field.value" class="input" :type="field.masked ? 'password' : 'text'" placeholder="字段内容" />
          <label class="switch-row"><span>遮罩显示</span><input v-model="field.masked" type="checkbox" /></label>
        </div>
      </section>

      <section class="card stack">
        <div class="split"><h2 class="section-title">2FA（TOTP）</h2><button class="btn-primary" type="button" @click="showScanner = true">扫描二维码</button></div>
        <div v-for="(totp, index) in draft.totp" :key="totp.id" class="nested-card stack">
          <div class="split">
            <strong>{{ totp.label || totp.issuer || totp.accountName || `TOTP ${index + 1}` }}</strong>
            <div class="cluster"><button class="btn-icon" :disabled="index === 0" @click="moveItem(draft.totp, index, -1)">↑</button><button class="btn-icon" :disabled="index === draft.totp.length - 1" @click="moveItem(draft.totp, index, 1)">↓</button><button class="btn-danger" @click="draft.totp.splice(index, 1)">删除</button></div>
          </div>
          <input v-model="totp.label" class="input" placeholder="标签" />
          <div class="grid-two"><input v-model="totp.issuer" class="input" placeholder="Issuer" /><input v-model="totp.accountName" class="input" placeholder="账号名" /></div>
          <input v-model="totp.secret" class="input mono" type="password" placeholder="Base32 Secret" />
          <div class="grid-three"><select v-model.number="totp.digits" class="select"><option :value="6">6 位</option><option :value="7">7 位</option><option :value="8">8 位</option></select><input v-model.number="totp.period" class="input" type="number" min="1" max="300" /><select v-model="totp.algorithm" class="select"><option value="SHA1">SHA-1</option><option value="SHA256">SHA-256</option><option value="SHA512">SHA-512</option></select></div>
        </div>

        <div class="nested-card stack">
          <h3 class="text-sm">粘贴 otpauth URI</h3>
          <textarea v-model="totpUri" class="textarea mono" rows="2" placeholder="otpauth://totp/..." />
          <button class="btn-ghost" type="button" @click="addTotpUri">解析并添加</button>
        </div>

        <div class="nested-card stack">
          <h3 class="text-sm">手工添加</h3>
          <input v-model="manualSecret" class="input mono" type="password" placeholder="Base32 Secret" />
          <div class="grid-two"><input v-model="manualIssuer" class="input" placeholder="Issuer" /><input v-model="manualAccount" class="input" placeholder="账号名" /></div>
          <input v-model="manualLabel" class="input" placeholder="标签" />
          <div class="grid-three"><select v-model.number="manualDigits" class="select"><option :value="6">6 位</option><option :value="7">7 位</option><option :value="8">8 位</option></select><input v-model.number="manualPeriod" class="input" type="number" min="1" max="300" /><select v-model="manualAlgorithm" class="select"><option value="SHA1">SHA-1</option><option value="SHA256">SHA-256</option><option value="SHA512">SHA-512</option></select></div>
          <button class="btn-ghost" type="button" @click="addTotpManual">添加 TOTP</button>
        </div>
      </section>

      <section class="card stack">
        <h2 class="section-title">绑定其它邮箱</h2>
        <div v-for="(link, index) in draft.linkedEmails" :key="`${link.kind}-${index}`" class="linked-row">
          <span class="grow">{{ link.kind === 'entry' ? `${link.labelSnapshot}${link.emailSnapshot ? ` · ${link.emailSnapshot}` : ''}` : link.email }}</span>
          <button class="btn-danger" @click="draft.linkedEmails.splice(index, 1)">移除</button>
        </div>
        <div class="cluster"><button class="chip" :class="{ 'is-active': linkMode === 'text' }" @click="linkMode = 'text'">手输邮箱</button><button class="chip" :class="{ 'is-active': linkMode === 'entry' }" @click="linkMode = 'entry'">选择库内条目</button></div>
        <template v-if="linkMode === 'text'"><input v-model="linkEmail" class="input" inputmode="email" placeholder="foo@example.com" /><input v-model="linkNote" class="input" placeholder="备注（可选）" /></template>
        <template v-else><input v-model="linkQuery" class="input" placeholder="搜索标题、账号、网址或备注" /><select v-model="selectedEntryId" class="select"><option value="">选择条目</option><option v-for="entry in linkCandidates" :key="entry.id" :value="entry.id">{{ entry.title }}{{ entry.username ? ` · ${entry.username}` : '' }}</option></select></template>
        <button class="btn-ghost" type="button" @click="addLinkedEmail">添加关联</button>
      </section>

      <TotpScanSheet :show="showScanner" :account-name="draft.username" @close="showScanner = false" @confirm="addTotp" />
    </div>
  </div>
</template>

<style scoped>
.sticky-header { position: sticky; top: calc(-1 * var(--space-4)); z-index: 20; padding: var(--space-3) 0; background: color-mix(in srgb, var(--color-bg) 92%, transparent); backdrop-filter: blur(14px); }
.input-actions { display: flex; gap: var(--space-2); }.input-actions .input { flex: 1; min-width: 0; }
.switch-row { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.switch-row input { width: 22px; height: 22px; accent-color: var(--color-primary); }
.nested-card { padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-soft); }
.grid-two { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2); }
.grid-three { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
.linked-row { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); }
@media (max-width: 560px) { .grid-two, .grid-three { grid-template-columns: 1fr; } }
</style>
