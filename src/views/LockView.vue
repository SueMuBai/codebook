<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { APP_NAME } from '@/app/version'
import { MASTER_PIN_ERROR, normalizeMasterPinInput, vaultUsesMasterPin } from '@/features/security'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const password = ref('')
const showPassword = ref(false)
const biometricAttempted = ref(false)
const usesPin = computed(() => vaultUsesMasterPin(session.record))
const canUseBiometrics = computed(
  () =>
    session.status === 'locked' &&
    session.biometricStatus.available &&
    session.biometricStatus.enabled,
)

watch([password, usesPin], ([value, pinMode]) => {
  if (!pinMode) return
  const normalized = normalizeMasterPinInput(value)
  if (value !== normalized) password.value = normalized
})

onMounted(async () => {
  if (session.status === 'booting') await session.bootstrap()
  if (canUseBiometrics.value) await unlockWithBiometrics(true)
})

function biometricErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : ''
}

async function finishUnlock() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/vault'
  await router.replace(redirect)
}

async function unlockWithBiometrics(automatic = false) {
  if (!canUseBiometrics.value || session.busy) return
  if (automatic) {
    if (biometricAttempted.value) return
    biometricAttempted.value = true
  }
  try {
    await session.unlockWithBiometrics()
    await finishUnlock()
  } catch (error) {
    if (biometricErrorCode(error) !== 'CANCELLED') {
      showToast(session.errorMessage || '生物识别解锁失败，请使用 PIN')
    }
  }
}

async function unlock() {
  if (!password.value) return showToast(usesPin.value ? '请输入主 PIN' : '请输入主密码')
  if (usesPin.value && password.value.length !== 6) return showToast(MASTER_PIN_ERROR)
  try {
    await session.unlock(password.value)
    password.value = ''
    await finishUnlock()
  } catch (error) {
    showToast(session.errorMessage || (error instanceof Error ? error.message : '解锁失败'))
  }
}

async function resetLegacy() {
  try {
    await showConfirmDialog({
      title: '清空旧版开发数据',
      message: '旧版 v1 数据与正式 v2 格式不兼容。清空后无法恢复。',
      confirmButtonText: '清空并重新创建',
      confirmButtonColor: '#e11d48',
    })
    await session.resetLocalData()
    await router.replace('/onboarding')
  } catch {
    // cancelled
  }
}

async function retryBootstrap() {
  await session.bootstrap()
}
</script>

<template>
  <div class="app-page lock-page">
    <div class="lock-layout">
      <section class="lock-visual">
        <div class="lock-seal"><span>密</span><i /><i /><i /></div>
        <div><p class="eyebrow">LOCAL VAULT</p><h1 class="text-display">欢迎回来</h1><p>{{ APP_NAME }} 已锁定。解锁前，数据密钥不会进入内存。</p></div>
        <div class="lock-proof"><AppIcon name="shield" :size="18" /><span>本地加密 · 无账号 · 无云同步</span></div>
      </section>

      <form class="lock-panel" @submit.prevent="unlock">
        <input type="text" name="username" value="codebook-local-vault" autocomplete="username" hidden />
        <div class="lock-panel__heading"><span><AppIcon name="lock" :size="22" /></span><div><h2>解锁保险箱</h2><p>{{ usesPin ? '输入 6 位主 PIN 继续' : '输入原主密码继续' }}</p></div></div>

        <template v-if="session.status === 'locked' || session.status === 'booting'">
          <button v-if="canUseBiometrics" class="btn-primary biometric-button" type="button" :disabled="session.busy" @click="unlockWithBiometrics()"><AppIcon name="fingerprint" :size="21" />{{ session.busy ? '正在验证…' : '使用指纹或人脸解锁' }}</button>
          <div v-if="canUseBiometrics" class="unlock-divider"><span>{{ usesPin ? '或使用主 PIN' : '或使用原主密码' }}</span></div>
          <label>
            <span class="field-label">{{ usesPin ? '主 PIN' : '原主密码' }}</span>
            <div class="password-field"><AppIcon name="key" :size="18" /><input v-model="password" class="input" :class="{ mono: usesPin }" :type="showPassword ? 'text' : 'password'" :inputmode="usesPin ? 'numeric' : 'text'" :pattern="usesPin ? '[0-9]*' : undefined" autocomplete="current-password" :placeholder="usesPin ? '输入 6 位数字' : '输入原主密码'" :disabled="session.busy" @keyup.enter="unlock" /><button type="button" :aria-label="showPassword ? '隐藏解锁凭据' : '显示解锁凭据'" @click="showPassword = !showPassword"><AppIcon :name="showPassword ? 'eyeOff' : 'eye'" :size="18" /></button></div>
          </label>
          <p v-if="session.errorMessage" class="inline-error"><AppIcon name="info" :size="17" />{{ session.errorMessage }}</p>
          <button class="btn-primary unlock-button" type="submit" :disabled="session.busy"><AppIcon name="lock" :size="18" />{{ session.busy ? '正在解锁…' : '解锁保险箱' }}</button>
        </template>

        <template v-else-if="session.status === 'legacy_reset_required'">
          <div class="notice-panel notice-panel--warning"><AppIcon name="info" /><div><strong>检测到旧版开发数据</strong><p class="text-secondary text-sm">正式 v2 格式不兼容旧数据，需要清空后重新创建。</p></div></div>
          <button class="btn-danger" type="button" @click="resetLegacy"><AppIcon name="trash" :size="18" />清空旧数据</button>
        </template>

        <template v-else-if="session.status === 'fatal'">
          <div class="notice-panel notice-panel--danger"><AppIcon name="info" /><span>{{ session.errorMessage || '初始化失败' }}</span></div>
          <button class="btn-ghost" type="button" @click="retryBootstrap">重新初始化</button>
        </template>
        <p class="lock-footnote"><AppIcon name="shield" :size="14" />解锁过程只在当前设备完成</p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.lock-page { display: grid; place-items: center; }
.lock-layout { width: min(100%, 930px); display: grid; gap: 28px; align-items: center; }
.lock-visual { display: flex; flex-direction: column; align-items: flex-start; gap: 26px; padding: 10px 4px; }
.lock-visual > div:nth-child(2) { display: grid; gap: 12px; }
.lock-visual > div:nth-child(2) > p:last-child { max-width: 480px; color: var(--color-text-secondary); line-height: 1.7; }
.lock-seal { position: relative; width: 96px; height: 96px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--color-primary) 35%, transparent); border-radius: 30px; background: var(--color-primary-soft); color: var(--color-primary); box-shadow: 0 24px 60px color-mix(in srgb, var(--color-primary) 15%, transparent); }
.lock-seal span { font-size: 36px; font-weight: 850; }
.lock-seal i { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: var(--color-accent); box-shadow: 0 0 16px var(--color-accent); }
.lock-seal i:nth-child(2) { top: 15px; right: 15px; }.lock-seal i:nth-child(3) { right: 13px; bottom: 22px; opacity: .45; }.lock-seal i:nth-child(4) { bottom: 13px; left: 23px; opacity: .25; }
.lock-proof { display: inline-flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 99px; color: var(--color-success); font-size: 12px; font-weight: 680; }
.lock-panel { display: flex; flex-direction: column; gap: 20px; padding: 26px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-large); background: color-mix(in srgb, var(--color-surface) 96%, transparent); box-shadow: var(--shadow-float); }
.lock-panel__heading { display: flex; align-items: center; gap: 13px; }
.lock-panel__heading > span { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 14px; background: var(--color-primary-soft); color: var(--color-primary); }
.lock-panel__heading h2 { font-size: 23px; letter-spacing: -.03em; }.lock-panel__heading p { margin-top: 3px; color: var(--color-text-muted); font-size: 12px; }
.password-field { position: relative; }.password-field > .app-icon { position: absolute; z-index: 1; left: 14px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); }.password-field .input { padding-left: 43px; padding-right: 50px; }.password-field button { position: absolute; right: 3px; top: 3px; width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: transparent; color: var(--color-text-muted); cursor: pointer; }
.inline-error { display: flex; align-items: center; gap: 7px; margin-top: -8px; color: var(--color-danger); font-size: 12px; }
.unlock-button { width: 100%; }
.biometric-button { width: 100%; min-height: 52px; }
.unlock-divider { display: flex; align-items: center; gap: 10px; color: var(--color-text-muted); font-size: 12px; }
.unlock-divider::before, .unlock-divider::after { height: 1px; flex: 1; content: ''; background: var(--color-border); }
.lock-footnote { display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--color-text-muted); font-size: 12px; }
@media (min-width: 760px) { .lock-layout { grid-template-columns: 1.1fr .9fr; } .lock-panel { padding: 30px; } }
@media (max-width: 759px) { .lock-visual { align-items: center; text-align: center; gap: 18px; }.lock-seal { width: 76px; height: 76px; border-radius: 24px; }.lock-seal span { font-size: 29px; }.lock-visual h1 { font-size: 38px; }.lock-proof { display: none; } }
</style>
