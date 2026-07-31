<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import {
  buildEncryptedPackage,
  entriesToCsv,
  parseCsvEntries,
  parseEncryptedPackage,
} from '@/features/export'
import { pickTextFile, saveTextFile } from '@/services/platform/files'
import { useSessionStore } from '@/stores/session'
import { useVaultStore } from '@/stores/vault'
import { toPortableSettings } from '@/types/domain'

const router = useRouter()
const session = useSessionStore()
const vault = useVaultStore()
const importText = ref('')
const selectedFile = ref('')
const backupPassword = ref('')
const showBackupPassword = ref(false)
const resultMessage = ref('')

const csvPreview = computed(() => {
  const text = importText.value.trim()
  if (!text || text.startsWith('{') || text.startsWith('[')) return null
  try {
    return parseCsvEntries(text)
  } catch {
    return null
  }
})

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

async function chooseFile() {
  try {
    const file = await pickTextFile('.json,.csv,text/csv,application/json')
    selectedFile.value = file.name
    importText.value = file.content
    resultMessage.value = ''
  } catch (error) {
    if (error instanceof Error && error.message !== '未选择文件') showToast(error.message)
  }
}

async function exportEncrypted() {
  if (!session.record) return showToast('没有可导出的保险箱')
  try {
    const pkg = buildEncryptedPackage({
      vault: session.record,
      settings: toPortableSettings(session.settings),
    })
    await saveTextFile(
      `codebook-backup-${timestamp()}.json`,
      JSON.stringify(pkg, null, 2),
      'application/json',
    )
    showToast('加密备份已生成')
  } catch (error) {
    const message = error instanceof Error ? error.message : '导出失败'
    if (!/cancel/i.test(message)) showToast(message)
  }
}

async function exportCsv() {
  try {
    await showConfirmDialog({
      title: '导出明文 CSV',
      message: 'CSV 包含账号和密码明文，不包含 TOTP、自定义字段和关联关系。',
      confirmButtonText: '继续导出',
      confirmButtonColor: '#e11d48',
    })
  } catch {
    return
  }
  try {
    await saveTextFile(
      `codebook-entries-${timestamp()}.csv`,
      entriesToCsv(vault.entries, vault.categories),
      'text/csv;charset=utf-8',
    )
    showToast('CSV 已生成')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CSV 导出失败'
    if (!/cancel/i.test(message)) showToast(message)
  }
}

async function importEncrypted() {
  if (!backupPassword.value) return showToast('请输入备份对应的主密码')
  try {
    const pkg = parseEncryptedPackage(importText.value)
    await showConfirmDialog({
      title: '替换当前保险箱',
      message: '备份验证成功后会完整替换本机保险箱。当前数据请先另行备份。',
      confirmButtonText: '验证并导入',
      confirmButtonColor: '#e11d48',
    })
    await session.importVault(pkg.vault, backupPassword.value, pkg.settings)
    backupPassword.value = ''
    importText.value = ''
    showToast('导入成功，请使用备份主密码解锁')
    await router.replace('/lock')
  } catch (error) {
    const message = error instanceof Error ? error.message : '导入失败'
    showToast(message)
    resultMessage.value = message
  }
}

async function importCsv() {
  let parsed
  try {
    parsed = parseCsvEntries(importText.value)
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'CSV 格式无效')
    return
  }
  if (!parsed.entries.length) {
    resultMessage.value = `成功 0 条，跳过 ${parsed.skipped} 行，失败 ${parsed.failed} 条。`
    showToast('没有可导入的有效条目')
    return
  }
  try {
    await showConfirmDialog({
      title: '导入明文 CSV',
      message: `将新增 ${parsed.entries.length} 条记录，跳过 ${parsed.skipped} 行，失败 ${parsed.failed} 条，不会覆盖现有条目。`,
      confirmButtonText: '确认导入',
    })
  } catch {
    return
  }
  try {
    const imported = await vault.importCsvEntries(parsed.entries)
    resultMessage.value = `成功 ${imported} 条，跳过 ${parsed.skipped} 行，失败 ${parsed.failed} 条。`
    importText.value = ''
    selectedFile.value = ''
    showToast(`已导入 ${imported} 条记录`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'CSV 导入失败'
    resultMessage.value = `成功 0 条，跳过 ${parsed.skipped} 行，失败 ${parsed.failed + parsed.entries.length} 条。`
    showToast(message)
  }
}
</script>

<template>
  <div class="app-page">
    <div class="page-content stack">
      <header class="page-header">
        <button class="btn-icon page-back" type="button" aria-label="返回" @click="router.back()"><AppIcon name="back" /></button>
        <div class="page-header__title"><h1 class="text-xl">导入与导出</h1><p class="text-muted text-sm">备份完整保险箱，或在受控环境中迁移数据</p></div>
      </header>

      <div class="export-grid">
        <section class="card backup-card">
          <div class="backup-card__header"><span class="backup-card__icon"><AppIcon name="shield" :size="27" /></span><span class="recommend-badge"><AppIcon name="check" :size="13" />推荐</span></div>
          <div><span class="eyebrow">完整保护</span><h2>完整加密备份</h2><p>包含分类、全部条目、自定义字段、TOTP 和邮箱关联。文件保持加密，恢复时需要导出时的主密码。</p></div>
          <ul class="backup-features"><li><AppIcon name="lock" :size="16" />端到端加密的数据包</li><li><AppIcon name="vault" :size="16" />保留完整保险箱结构</li><li><AppIcon name="key" :size="16" />由当前主密码保护</li></ul>
          <button class="btn-primary" type="button" @click="exportEncrypted"><AppIcon name="download" :size="18" />导出加密 JSON</button>
        </section>

        <section class="card csv-card">
          <span class="csv-card__icon"><AppIcon name="file" :size="24" /></span>
          <div><span class="eyebrow danger-text">明文交换</span><h2 class="section-title">明文 CSV</h2><p class="text-muted text-sm">仅导出账号和密码，不包含 TOTP、自定义字段及关联关系。</p></div>
          <div class="notice-panel notice-panel--danger"><AppIcon name="info" :size="19" /><span class="text-sm">CSV 会直接暴露账号和密码，只适合受控迁移，不能作为日常备份。</span></div>
          <button class="btn-danger" type="button" @click="exportCsv"><AppIcon name="download" :size="18" />导出明文 CSV</button>
        </section>
      </div>

      <form class="card import-workspace" @submit.prevent="importEncrypted">
        <input type="text" name="username" value="codebook-local-vault" autocomplete="username" hidden />
        <div class="import-heading"><div><span class="eyebrow">恢复与迁移</span><h2 class="section-title">导入文件</h2><p>选择本地文件，或直接粘贴加密 JSON / CSV 内容</p></div><button class="btn-ghost" type="button" @click="chooseFile"><AppIcon name="upload" :size="18" />选择文件</button></div>
        <div v-if="selectedFile" class="selected-file"><span class="selected-file__icon"><AppIcon name="file" /></span><span class="grow"><strong>{{ selectedFile }}</strong><small>文件内容已载入，可在下方检查</small></span><AppIcon name="check" class="success-text" /></div>
        <label><span class="field-label">文件内容</span><textarea v-model="importText" class="textarea mono import-text" rows="9" placeholder="选择文件，或在此粘贴加密 JSON / CSV" /></label>
        <div v-if="csvPreview" class="preview"><span class="preview__label"><AppIcon name="info" :size="18" />CSV 预览</span><span class="preview-stat"><strong>{{ csvPreview.entries.length }}</strong><small>有效</small></span><span class="preview-stat"><strong>{{ csvPreview.skipped }}</strong><small>跳过</small></span><span class="preview-stat" :class="{ 'preview-stat--danger': csvPreview.failed }"><strong>{{ csvPreview.failed }}</strong><small>失败</small></span></div>
        <div class="import-bottom">
          <label class="password-field"><span class="field-label">备份主密码（仅导入加密 JSON 时需要）</span><span class="field-with-icon"><AppIcon name="key" :size="18" /><input v-model="backupPassword" class="input" :type="showBackupPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="输入备份导出时使用的主密码" /><button type="button" :aria-label="showBackupPassword ? '隐藏备份主密码' : '显示备份主密码'" @click="showBackupPassword = !showBackupPassword"><AppIcon :name="showBackupPassword ? 'eyeOff' : 'eye'" :size="18" /></button></span></label>
          <div class="import-actions"><button class="btn-primary" type="submit"><AppIcon name="shield" :size="18" />导入加密备份</button><button class="btn-ghost" type="button" @click="importCsv"><AppIcon name="file" :size="18" />导入 CSV</button></div>
        </div>
        <p v-if="resultMessage" class="result-message text-sm"><AppIcon name="info" :size="18" />{{ resultMessage }}</p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.export-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(260px, .75fr); gap: 20px; }
.backup-card, .csv-card { display: flex; flex-direction: column; gap: 18px; min-height: 360px; }.backup-card { position: relative; overflow: hidden; border-color: color-mix(in srgb, var(--color-primary) 25%, var(--color-border)); background: radial-gradient(circle at 90% 5%, var(--color-primary-soft), transparent 42%), var(--color-surface); }.backup-card::after { content: ''; position: absolute; width: 180px; height: 180px; right: -90px; bottom: -100px; border: 26px solid var(--color-primary-soft); border-radius: 50%; pointer-events: none; }.backup-card__header { display: flex; justify-content: space-between; align-items: flex-start; }.backup-card__icon, .csv-card__icon { width: 54px; height: 54px; display: grid; place-items: center; border-radius: 18px; background: var(--color-primary-soft); color: var(--color-primary); }.csv-card__icon { background: color-mix(in srgb, var(--color-danger) 9%, transparent); color: var(--color-danger); }.recommend-badge { display: inline-flex; align-items: center; gap: 5px; min-height: 28px; padding: 0 10px; border-radius: var(--radius-pill); background: color-mix(in srgb, var(--color-success) 12%, transparent); color: var(--color-success); font-size: 12px; font-weight: 800; }.eyebrow { color: var(--color-primary); font-size: 12px; font-weight: 800; letter-spacing: .12em; }.backup-card h2 { margin: 6px 0 8px; font-size: 25px; }.backup-card p, .csv-card p { color: var(--color-text-secondary); font-size: 12px; line-height: 1.7; }.backup-features { display: grid; gap: 9px; }.backup-features li { display: flex; align-items: center; gap: 8px; color: var(--color-text-secondary); font-size: 12px; }.backup-features .app-icon { color: var(--color-success); }.backup-card .btn-primary, .csv-card .btn-danger { margin-top: auto; align-self: flex-start; }
.import-workspace { display: grid; gap: 18px; }.import-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }.import-heading h2 { margin: 6px 0 3px; }.import-heading p { color: var(--color-text-muted); font-size: 12px; }.selected-file { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid color-mix(in srgb, var(--color-success) 22%, var(--color-border)); border-radius: 14px; background: color-mix(in srgb, var(--color-success) 6%, var(--color-surface-elevated)); }.selected-file__icon { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; color: var(--color-success); background: color-mix(in srgb, var(--color-success) 10%, transparent); }.selected-file span { display: grid; gap: 3px; }.selected-file strong { overflow-wrap: anywhere; font-size: 13px; }.selected-file small { color: var(--color-text-muted); font-size: 12px; }.import-text { min-height: 190px; }.preview { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 14px; background: var(--color-bg-soft); }.preview__label { display: flex; align-items: center; gap: 7px; flex: 1; color: var(--color-text-secondary); font-size: 12px; font-weight: 700; }.preview-stat { min-width: 58px; display: grid; justify-items: center; gap: 2px; padding: 6px 10px; border-left: 1px solid var(--color-border); }.preview-stat strong { font-family: var(--font-mono); font-size: 16px; }.preview-stat small { color: var(--color-text-muted); font-size: 12px; }.preview-stat--danger strong { color: var(--color-danger); }.import-bottom { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 16px; }.field-with-icon { position: relative; display: block; }.field-with-icon > .app-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); }.field-with-icon .input { padding-left: 43px; padding-right: 50px; }.field-with-icon button { position: absolute; right: 3px; top: 3px; width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: transparent; color: var(--color-text-muted); cursor: pointer; }.import-actions { display: flex; gap: 8px; }.result-message { display: flex; align-items: center; gap: 8px; margin: 0; padding: 12px; border-radius: 13px; background: var(--color-primary-soft); color: var(--color-text-secondary); }
@media (max-width: 920px) { .export-grid { grid-template-columns: 1fr; }.backup-card, .csv-card { min-height: auto; }.import-bottom { grid-template-columns: 1fr; }.import-actions { justify-content: flex-end; } }
@media (max-width: 560px) { .import-heading { align-items: flex-start; flex-direction: column; }.import-heading .btn-ghost { width: 100%; }.preview { flex-wrap: wrap; }.preview__label { flex-basis: 100%; }.preview-stat { flex: 1; }.import-actions { display: grid; grid-template-columns: 1fr; }.backup-card .btn-primary, .csv-card .btn-danger { width: 100%; } }
</style>
