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
      confirmButtonColor: '#d84f61',
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
      confirmButtonColor: '#d84f61',
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
        <button class="btn-ghost" type="button" @click="router.back()">返回</button>
        <div class="page-header__title"><h1 class="text-xl">导入与导出</h1></div>
      </header>

      <section class="card stack">
        <h2 class="section-title">完整加密备份</h2>
        <p class="text-secondary text-sm">包含分类、全部条目、自定义字段、TOTP 和邮箱关联。恢复时需要导出时的主密码。</p>
        <button class="btn-primary" type="button" @click="exportEncrypted">导出加密 JSON</button>
      </section>

      <section class="card stack">
        <h2 class="section-title">明文 CSV</h2>
        <p class="warning-text text-sm">CSV 会暴露账号和密码，只适合受控迁移，不是备份格式。</p>
        <button class="btn-danger" type="button" @click="exportCsv">导出明文 CSV</button>
      </section>

      <form class="card stack" @submit.prevent="importEncrypted">
        <div class="split"><h2 class="section-title">导入文件</h2><button class="btn-ghost" type="button" @click="chooseFile">选择文件</button></div>
        <p v-if="selectedFile" class="text-muted text-sm">已选择：{{ selectedFile }}</p>
        <textarea v-model="importText" class="textarea mono" rows="9" placeholder="选择文件，或在此粘贴加密 JSON / CSV" />
        <label><span class="field-label">备份主密码（仅导入加密 JSON 时需要）</span><input v-model="backupPassword" class="input" type="password" autocomplete="current-password" /></label>
        <div v-if="csvPreview" class="preview text-sm">CSV 预览：有效 {{ csvPreview.entries.length }} 条，跳过 {{ csvPreview.skipped }} 行，失败 {{ csvPreview.failed }} 条</div>
        <div class="grid-two"><button class="btn-primary" type="submit">导入加密备份</button><button class="btn-ghost" type="button" @click="importCsv">导入 CSV</button></div>
        <p v-if="resultMessage" class="text-secondary text-sm">{{ resultMessage }}</p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.preview { padding: 12px; border-radius: var(--radius-sm); background: var(--color-bg-soft); color: var(--color-text-secondary); }
.grid-two { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2); }
@media (max-width: 520px) { .grid-two { grid-template-columns: 1fr; } }
</style>
