<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { APP_NAME, APP_VERSION } from '@/app/version'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import type { ThemeMode } from '@/types/domain'

const router = useRouter()
const session = useSessionStore()
const settingsStore = useSettingsStore()
const isNative = Capacitor.isNativePlatform()

async function setNumber(key: 'autoLockSeconds' | 'clipboardClearSeconds' | 'totpRevealSeconds', event: Event) {
  await settingsStore.update({ [key]: Number((event.target as HTMLSelectElement).value) })
}

async function setTheme(event: Event) {
  await settingsStore.update({ theme: (event.target as HTMLSelectElement).value as ThemeMode })
}

async function toggleScreenProtection() {
  const next = !settingsStore.settings.screenProtectionEnabled
  if (!next) {
    try {
      await showConfirmDialog({
        title: '关闭屏幕保护？',
        message: '关闭后允许截屏，并可能在最近任务中显示敏感内容。',
        confirmButtonText: '仍要关闭',
        confirmButtonColor: '#d84f61',
      })
    } catch {
      return
    }
  }
  try {
    await settingsStore.update({ screenProtectionEnabled: next })
    showToast(next ? '屏幕保护已开启' : '屏幕保护已关闭')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '设置失败')
  }
}

function lockNow() {
  session.lock()
  void router.replace('/lock')
}

async function clearAll() {
  try {
    await showConfirmDialog({
      title: '清空所有本地数据',
      message: '保险箱、设置和密钥都会被删除。此操作无法撤销，请先导出加密备份。',
      confirmButtonText: '永久清空',
      confirmButtonColor: '#d84f61',
    })
    await session.resetLocalData()
    await router.replace('/onboarding')
  } catch {
    // cancelled
  }
}
</script>

<template>
  <div class="app-page app-page--with-nav">
    <div class="page-content stack">
      <header class="page-header">
        <div class="page-header__title">
          <h1 class="text-xl">设置</h1>
          <p class="text-muted text-sm">{{ APP_NAME }} v{{ APP_VERSION }}</p>
        </div>
      </header>

      <section class="card settings-card">
        <button class="settings-link" @click="router.push('/categories')"><span>分类管理</span><span>›</span></button>
        <button class="settings-link" @click="router.push('/settings/import-export')"><span>导入与导出</span><span>›</span></button>
        <button class="settings-link" @click="router.push('/settings/master-password')"><span>修改主密码</span><span>›</span></button>
      </section>

      <section class="card stack">
        <h2 class="section-title">安全与显示</h2>
        <label class="setting-field"><span>自动锁定</span><select class="select compact" :value="settingsStore.settings.autoLockSeconds" @change="setNumber('autoLockSeconds', $event)"><option :value="0">关闭</option><option :value="30">30 秒</option><option :value="60">60 秒</option><option :value="90">90 秒</option><option :value="180">3 分钟</option><option :value="300">5 分钟</option></select></label>
        <label class="setting-field"><span>剪贴板清除</span><select class="select compact" :value="settingsStore.settings.clipboardClearSeconds" @change="setNumber('clipboardClearSeconds', $event)"><option :value="0">关闭</option><option :value="15">15 秒</option><option :value="30">30 秒</option><option :value="60">60 秒</option></select></label>
        <label class="setting-field"><span>TOTP 显示</span><select class="select compact" :value="settingsStore.settings.totpRevealSeconds" @change="setNumber('totpRevealSeconds', $event)"><option :value="0">持续显示</option><option :value="10">10 秒</option><option :value="30">30 秒</option><option :value="60">60 秒</option></select></label>
        <label class="setting-field"><span>主题</span><select class="select compact" :value="settingsStore.settings.theme" @change="setTheme"><option value="auto">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
        <button v-if="isNative" class="setting-field button-field" @click="toggleScreenProtection"><span>Android 屏幕保护</span><span :class="settingsStore.settings.screenProtectionEnabled ? 'success-text' : 'danger-text'">{{ settingsStore.settings.screenProtectionEnabled ? '已开启' : '已关闭' }}</span></button>
      </section>

      <section class="card settings-card">
        <button class="settings-link" @click="lockNow"><span>立即锁定</span><span class="text-muted">清除内存密钥</span></button>
        <button class="settings-link danger-text" @click="clearAll"><span>清空本地数据</span><span>›</span></button>
      </section>

      <p class="text-muted text-sm about">本地加密 · 无账号 · 无云同步 · 生物识别暂未开放</p>
    </div>
  </div>
</template>

<style scoped>
.settings-card { padding: 0; overflow: hidden; }
.settings-link { width: 100%; min-height: 54px; display: flex; align-items: center; justify-content: space-between; padding: 0 var(--space-4); border: 0; border-bottom: 1px solid var(--color-border); background: transparent; color: inherit; text-align: left; }
.settings-link:last-child { border-bottom: 0; }
.setting-field { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: 50px; border-bottom: 1px solid var(--color-border); }
.setting-field:last-child { border-bottom: 0; }
.compact { width: min(180px, 52%); }
.button-field { width: 100%; border-left: 0; border-right: 0; border-top: 0; background: transparent; color: inherit; padding: 0; }
.about { text-align: center; padding: var(--space-3); }
</style>
