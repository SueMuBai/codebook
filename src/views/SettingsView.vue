<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { APP_NAME, APP_VERSION } from '@/app/version'
import { confirmDanger } from '@/services/ui/dialogs'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { extractErrorCode } from '@/utils/errorCode'
import type { ThemeMode } from '@/types/domain'

const router = useRouter()
const session = useSessionStore()
const settingsStore = useSettingsStore()
const isNative = Capacitor.isNativePlatform()
const isAndroid = isNative && Capacitor.getPlatform() === 'android'

const biometricStatusText = computed(() => {
  if (session.biometricStatus.enabled) return '已开启'
  if (session.biometricStatus.available) return '可开启'
  return '不可用'
})

const biometricReasonText = computed(() => {
  switch (session.biometricStatus.reason) {
    case 'NOT_ENROLLED': return '请先在系统设置中录入指纹或人脸'
    case 'NO_HARDWARE': return '设备没有生物识别硬件'
    case 'HW_UNAVAILABLE': return '生物识别硬件暂时不可用'
    case 'SECURITY_UPDATE_REQUIRED': return '安装系统安全更新后可用'
    case 'UNSUPPORTED': return '设备不支持安全的生物识别解锁'
    case 'CHECK_FAILED': return '暂时无法检查生物识别状态'
    default: return '使用 Android Keystore 保护保险箱密钥'
  }
})

onMounted(() => {
  if (isAndroid) void session.refreshBiometricStatus()
})

async function setNumber(key: 'autoLockSeconds' | 'clipboardClearSeconds' | 'totpRevealSeconds', event: Event) {
  await settingsStore.update({ [key]: Number((event.target as HTMLSelectElement).value) })
}

async function setTheme(event: Event) {
  await settingsStore.update({ theme: (event.target as HTMLSelectElement).value as ThemeMode })
}

async function toggleScreenProtection() {
  const next = !settingsStore.settings.screenProtectionEnabled
  if (!next) {
    const confirmed = await confirmDanger({
      title: '关闭屏幕保护？',
      message: '关闭后允许截屏，并可能在最近任务中显示敏感内容。',
      confirmText: '仍要关闭',
    })
    if (!confirmed) return
  }
  try {
    await settingsStore.update({ screenProtectionEnabled: next })
    showToast(next ? '屏幕保护已开启' : '屏幕保护已关闭')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '设置失败')
  }
}

async function toggleBiometricUnlock() {
  if (!isAndroid || session.busy) return
  if (!session.biometricStatus.enabled && !session.biometricStatus.available) {
    await session.refreshBiometricStatus()
    if (!session.biometricStatus.available) {
      showToast(biometricReasonText.value)
      return
    }
  }
  try {
    const next = !session.biometricStatus.enabled
    await session.setBiometricUnlockEnabled(next)
    showToast(next ? '指纹或人脸解锁已开启' : '生物识别解锁已关闭')
  } catch (error) {
    if (extractErrorCode(error) !== 'CANCELLED')
      showToast(error instanceof Error ? error.message : '设置失败')
  }
}

function lockNow() {
  session.lock()
  void router.replace('/lock')
}

async function clearAll() {
  const confirmed = await confirmDanger({
    title: '清空所有本地数据',
    message: '保险箱、设置和密钥都会被删除。此操作无法撤销，请先导出加密备份。',
    confirmText: '永久清空',
  })
  if (!confirmed) return
  await session.resetLocalData()
  await router.replace('/onboarding')
}
</script>

<template>
  <div class="app-page app-page--with-nav">
    <div class="page-content stack">
      <header class="page-header">
        <div class="page-header__title">
          <h1 class="text-xl">设置</h1>
          <p class="text-muted text-sm">管理保险箱、安全策略与显示偏好</p>
        </div>
      </header>

      <div class="settings-grid">
        <div class="settings-main stack">
          <section class="card settings-section">
            <div class="section-heading">
              <div class="section-heading__copy"><h2 class="section-title">保险箱管理</h2><p>整理分类、迁移数据或更新访问凭据</p></div>
              <span class="section-icon"><AppIcon name="vault" /></span>
            </div>
            <button class="settings-link" type="button" @click="router.push('/categories')"><span class="settings-link__icon"><AppIcon name="folder" /></span><span class="settings-link__copy"><strong>分类管理</strong><small>创建、排序和调整条目分类</small></span><AppIcon name="chevron" :size="18" /></button>
            <button class="settings-link" type="button" @click="router.push('/settings/import-export')"><span class="settings-link__icon"><AppIcon name="download" /></span><span class="settings-link__copy"><strong>导入与导出</strong><small>加密备份与 CSV 数据迁移</small></span><AppIcon name="chevron" :size="18" /></button>
            <button class="settings-link" type="button" @click="router.push('/settings/master-password')"><span class="settings-link__icon"><AppIcon name="key" /></span><span class="settings-link__copy"><strong>修改主 PIN</strong><small>设置新的 6 位数字解锁凭据</small></span><AppIcon name="chevron" :size="18" /></button>
          </section>

          <section class="card settings-section">
            <div class="section-heading"><div class="section-heading__copy"><h2 class="section-title">安全与隐私</h2><p>控制敏感信息在设备上的停留时间</p></div><span class="section-icon section-icon--safe"><AppIcon name="shield" /></span></div>
            <label class="setting-field"><span class="setting-field__copy"><AppIcon name="timer" /><span><strong>自动锁定</strong><small>无操作后清除内存中的解密密钥</small></span></span><select class="select compact" aria-label="自动锁定" :value="settingsStore.settings.autoLockSeconds" @change="setNumber('autoLockSeconds', $event)"><option :value="0">关闭</option><option :value="30">30 秒</option><option :value="60">60 秒</option><option :value="90">90 秒</option><option :value="180">3 分钟</option><option :value="300">5 分钟</option></select></label>
            <label class="setting-field"><span class="setting-field__copy"><AppIcon name="clipboard" /><span><strong>剪贴板清除</strong><small>复制敏感内容后自动覆盖剪贴板</small></span></span><select class="select compact" aria-label="剪贴板清除" :value="settingsStore.settings.clipboardClearSeconds" @change="setNumber('clipboardClearSeconds', $event)"><option :value="0">关闭</option><option :value="15">15 秒</option><option :value="30">30 秒</option><option :value="60">60 秒</option></select></label>
            <label class="setting-field"><span class="setting-field__copy"><AppIcon name="eye" /><span><strong>TOTP 显示</strong><small>验证码显示后自动隐藏</small></span></span><select class="select compact" aria-label="TOTP 显示" :value="settingsStore.settings.totpRevealSeconds" @change="setNumber('totpRevealSeconds', $event)"><option :value="0">持续显示</option><option :value="10">10 秒</option><option :value="30">30 秒</option><option :value="60">60 秒</option></select></label>
            <button v-if="isAndroid" class="setting-field button-field" type="button" :disabled="session.busy" @click="toggleBiometricUnlock"><span class="setting-field__copy"><AppIcon name="fingerprint" /><span><strong>指纹或人脸解锁</strong><small>{{ biometricReasonText }}</small></span></span><span class="status-pill" :class="{ 'status-pill--danger': !session.biometricStatus.available && !session.biometricStatus.enabled }">{{ biometricStatusText }}</span></button>
            <button v-if="isNative" class="setting-field button-field" type="button" @click="toggleScreenProtection"><span class="setting-field__copy"><AppIcon name="shield" /><span><strong>Android 屏幕保护</strong><small>阻止截屏和最近任务预览</small></span></span><span class="status-pill" :class="{ 'status-pill--danger': !settingsStore.settings.screenProtectionEnabled }">{{ settingsStore.settings.screenProtectionEnabled ? '已开启' : '已关闭' }}</span></button>
          </section>

          <section class="card settings-section">
            <div class="section-heading"><div class="section-heading__copy"><h2 class="section-title">显示</h2><p>选择最适合当前环境的界面主题</p></div><span class="section-icon"><AppIcon name="palette" /></span></div>
            <label class="setting-field"><span class="setting-field__copy"><AppIcon name="palette" /><span><strong>主题</strong><small>浅色、深色或跟随系统设置</small></span></span><select class="select compact" aria-label="主题" :value="settingsStore.settings.theme" @change="setTheme"><option value="auto">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
          </section>
        </div>

        <aside class="settings-aside stack">
          <section class="card lock-card">
            <span class="lock-card__icon"><AppIcon name="lock" :size="24" /></span>
            <div><h2 class="section-title">离开设备？</h2><p class="text-muted text-sm">立即清除会话密钥，下次使用生物识别或主 PIN 解锁。</p></div>
            <button class="btn-primary" type="button" @click="lockNow"><AppIcon name="lock" :size="18" />立即锁定</button>
          </section>

          <section class="card danger-zone">
            <span class="eyebrow danger-text">危险区域</span>
            <h2 class="section-title">清空本地数据</h2>
            <p class="text-muted text-sm">永久删除保险箱、设置和本机密钥。请先导出加密备份。</p>
            <button class="btn-danger" type="button" @click="clearAll"><AppIcon name="trash" :size="18" />清空本地数据</button>
          </section>

          <section class="about-card">
            <span class="app-brand__mark about-mark">密</span>
            <div><strong>{{ APP_NAME }}</strong><p>codebook · v{{ APP_VERSION }}</p></div>
            <p class="about-copy">本地加密 · 无账号 · 无云同步<br>Android Keystore 生物识别保护</p>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }
.settings-section { padding-bottom: 4px; overflow: hidden; }
.section-icon { width: 40px; height: 40px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 13px; background: var(--color-primary-soft); color: var(--color-primary); }
.section-icon--safe { color: var(--color-success); background: color-mix(in srgb, var(--color-success) 12%, transparent); }
.settings-link { width: 100%; min-height: 70px; display: flex; align-items: center; gap: 12px; padding: 10px 0; border: 0; border-bottom: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted); text-align: left; cursor: pointer; }
.settings-link:last-child { border-bottom: 0; }
.settings-link:hover { color: var(--color-primary); }
.settings-link__icon { width: 38px; height: 38px; display: grid; place-items: center; flex: 0 0 auto; border: 1px solid var(--color-border); border-radius: 12px; color: var(--color-text-secondary); background: var(--color-surface-elevated); }
.settings-link__copy { flex: 1; display: grid; gap: 3px; color: var(--color-text); }
.settings-link__copy strong, .setting-field strong { font-size: 14px; }
.settings-link__copy small, .setting-field small { color: var(--color-text-muted); font-size: 12px; line-height: 1.45; }
.setting-field { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 68px; border-bottom: 1px solid var(--color-border); }
.setting-field:last-child { border-bottom: 0; }
.setting-field__copy { min-width: 0; display: flex; align-items: center; gap: 12px; }
.setting-field__copy > .app-icon { flex: 0 0 auto; color: var(--color-text-muted); }
.setting-field__copy > span { display: grid; gap: 3px; }
.compact { width: 156px; min-height: 44px; flex: 0 0 auto; padding-block: 7px; }
.button-field { width: 100%; border-left: 0; border-right: 0; border-top: 0; background: transparent; color: inherit; padding: 0; cursor: pointer; }
.status-pill--danger { color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 10%, transparent); }
.lock-card, .danger-zone { display: flex; flex-direction: column; gap: 13px; }
.lock-card__icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 16px; background: var(--color-primary-soft); color: var(--color-primary); }
.lock-card p, .danger-zone p { margin-top: 5px; line-height: 1.6; }
.danger-zone { border-color: color-mix(in srgb, var(--color-danger) 20%, var(--color-border)); }
.eyebrow { font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.about-card { display: grid; grid-template-columns: auto 1fr; gap: 11px; align-items: center; padding: 8px 5px; color: var(--color-text-secondary); }
.about-mark { width: 38px; height: 38px; border-radius: 12px; font-size: 16px; }
.about-card strong { font-size: 14px; }
.about-card p { margin: 2px 0 0; color: var(--color-text-muted); font-size: 12px; }
.about-card .about-copy { grid-column: 1 / -1; line-height: 1.65; }
@media (max-width: 980px) { .settings-grid { grid-template-columns: 1fr; } .settings-aside { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } .about-card { grid-column: 1 / -1; } }
@media (max-width: 560px) { .settings-aside { display: flex; } .setting-field { align-items: flex-start; flex-direction: column; padding: 14px 0; } .compact { width: 100%; } .button-field { align-items: center; flex-direction: row; } .button-field .setting-field__copy { align-items: flex-start; } }
</style>
