<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { showToast } from 'vant'
import { registerBackHandler } from '@/services/navigation/backStack'
import { getQrScanner, stopActiveScanner } from '@/services/scanner/QrScanner'
import { totpFromManual, totpFromUri } from '@/features/totp'
import type { TotpAlgorithm, TotpDigits, TotpSecret } from '@/types/domain'

const props = defineProps<{ show: boolean; accountName?: string }>()
const emit = defineEmits<{ close: []; confirm: [totp: TotpSecret] }>()

const stage = ref<'scanning' | 'review'>('scanning')
const status = ref('准备相机…')
const secret = ref('')
const issuer = ref('')
const scannedAccountName = ref('')
const label = ref('')
const digits = ref<TotpDigits>(6)
const period = ref(30)
const algorithm = ref<TotpAlgorithm>('SHA1')
const scannedPlainSecret = ref(false)
const dialogElement = ref<HTMLElement | null>(null)
let runId = 0
let unregisterBack: (() => void) | null = null

const maskedSecret = computed(() =>
  secret.value.length <= 8
    ? '••••••••'
    : `${secret.value.slice(0, 4)}••••${secret.value.slice(-4)}`,
)

function resetReview() {
  stage.value = 'scanning'
  status.value = '准备相机…'
  secret.value = ''
  issuer.value = ''
  scannedAccountName.value = props.accountName ?? ''
  label.value = ''
  digits.value = 6
  period.value = 30
  algorithm.value = 'SHA1'
  scannedPlainSecret.value = false
}

function fillReview(raw: string) {
  const value = raw.trim()
  scannedPlainSecret.value = !value.toLowerCase().startsWith('otpauth://')
  const parsed = !scannedPlainSecret.value
    ? totpFromUri(value)
    : totpFromManual({ secret: value, accountName: props.accountName })
  secret.value = parsed.secret
  issuer.value = parsed.issuer ?? ''
  scannedAccountName.value = parsed.accountName ?? props.accountName ?? ''
  label.value = parsed.label ?? ''
  digits.value = parsed.digits
  period.value = parsed.period
  algorithm.value = parsed.algorithm
  stage.value = 'review'
}

async function startScan() {
  const currentRun = ++runId
  resetReview()
  status.value = '扫描中，请将 2FA 二维码置于取景框内'
  try {
    const scanner = getQrScanner()
    if (!(await scanner.isSupported())) throw new Error('当前环境不支持相机扫码')
    const result = await scanner.scanOnce()
    if (currentRun !== runId || !props.show) return
    fillReview(result.rawValue)
  } catch (error) {
    if (currentRun !== runId || !props.show) return
    const message = error instanceof Error ? error.message : '扫码失败'
    if (!/取消|停止/.test(message)) showToast(message)
    emit('close')
  }
}

async function close() {
  runId += 1
  await stopActiveScanner()
  emit('close')
}

function confirm() {
  try {
    emit('confirm', totpFromManual({
      secret: secret.value,
      issuer: issuer.value,
      accountName: scannedAccountName.value,
      label: label.value,
      digits: digits.value,
      period: period.value,
      algorithm: algorithm.value,
    }))
    emit('close')
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'TOTP 参数无效')
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void close()
    return
  }
  if (event.key !== 'Tab' || !dialogElement.value) return
  const focusable = Array.from(dialogElement.value.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter((element) => !element.hasAttribute('disabled'))
  if (!focusable.length) return
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.show,
  (show) => {
    unregisterBack?.()
    unregisterBack = null
    if (show) {
      unregisterBack = registerBackHandler(async () => {
        await close()
        return true
      })
      void nextTick(() => dialogElement.value?.focus())
      void startScan()
    } else {
      runId += 1
      void stopActiveScanner()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  runId += 1
  unregisterBack?.()
  void stopActiveScanner()
})
</script>

<template>
  <div v-if="show" ref="dialogElement" class="scan-shell" :class="`scan-shell--${stage}`" role="dialog" aria-modal="true" aria-label="扫描 TOTP 二维码" tabindex="-1" @keydown="handleKeydown">
    <section class="scan-card" :class="`scan-card--${stage}`">
      <template v-if="stage === 'scanning'">
        <header class="scan-header"><div><span class="eyebrow">本机安全扫描</span><h2 class="text-xl">扫描 2FA 二维码</h2></div><button class="btn-icon" type="button" aria-label="取消扫码" @click="close"><AppIcon name="close" /></button></header>
        <div class="camera-frame" aria-hidden="true"><span class="corner corner--tl" /><span class="corner corner--tr" /><span class="corner corner--bl" /><span class="corner corner--br" /><span class="scan-line" /><span class="camera-frame__mark"><AppIcon name="qr" :size="40" /></span></div>
        <div class="scan-status"><span class="scan-status__pulse" /><div><strong>正在寻找二维码</strong><p>{{ status }}</p></div></div>
        <div class="privacy-note"><AppIcon name="shield" :size="19" /><span><strong>图像不会离开设备</strong><small>画面只在本机实时解析，不上传、不保存。也可以取消后手工输入。</small></span></div>
        <button class="btn-ghost cancel-scan" type="button" @click="close">取消扫码</button>
      </template>

      <template v-else>
        <header class="scan-header"><div><span class="eyebrow">扫描完成</span><h2 class="text-xl">确认 TOTP 参数</h2><p>确认后只加入条目草稿，仍需保存条目。</p></div><button class="btn-icon" type="button" aria-label="取消" @click="close"><AppIcon name="close" /></button></header>
        <div v-if="scannedPlainSecret" class="notice-panel notice-panel--warning"><AppIcon name="info" :size="20" /><span class="text-sm">检测到密钥文本，而不是 otpauth URI。请核对来源和参数后再添加。</span></div>
        <div class="secret-panel"><span class="secret-panel__icon"><AppIcon name="key" :size="21" /></span><span><small>Base32 Secret</small><strong class="mono">{{ maskedSecret }}</strong></span><span class="status-pill"><AppIcon name="shield" :size="13" />已遮罩</span></div>
        <div class="review-form"><label><span class="field-label">标签</span><input v-model="label" class="input" placeholder="例如：主账号" /></label><label><span class="field-label">Issuer</span><input v-model="issuer" class="input" placeholder="服务提供方" /></label><label class="span-2"><span class="field-label">账号名</span><input v-model="scannedAccountName" class="input" placeholder="对应账号" /></label></div>
        <div class="parameter-panel"><span class="parameter-panel__title">验证参数</span><div class="grid-three"><label><span class="field-label">位数</span><select v-model.number="digits" class="select"><option :value="6">6 位</option><option :value="7">7 位</option><option :value="8">8 位</option></select></label><label><span class="field-label">周期</span><input v-model.number="period" class="input" type="number" min="1" max="300" /></label><label><span class="field-label">算法</span><select v-model="algorithm" class="select"><option value="SHA1">SHA-1</option><option value="SHA256">SHA-256</option><option value="SHA512">SHA-512</option></select></label></div></div>
        <footer class="review-actions"><button class="btn-ghost" type="button" @click="close">取消</button><button class="btn-primary grow" type="button" @click="confirm"><AppIcon name="check" :size="18" />添加到草稿</button></footer>
      </template>
    </section>
  </div>
</template>

<style scoped>
.scan-shell { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; background: var(--color-scrim); backdrop-filter: blur(16px); visibility: visible; }.scan-shell--scanning { background: rgba(3, 12, 10, .28); backdrop-filter: none; }.scan-card { width: min(100%, 560px); max-height: calc(100vh - 32px); display: grid; gap: 18px; overflow-y: auto; padding: 24px; border: 1px solid var(--color-border-strong); border-radius: 26px; background: var(--color-surface); box-shadow: var(--shadow-float); }.scan-card--scanning { width: min(100%, 470px); background: transparent; border-color: transparent; box-shadow: none; }.scan-card--scanning .scan-header, .scan-card--scanning .scan-status, .scan-card--scanning .privacy-note, .scan-card--scanning .cancel-scan { padding: 12px 14px; border: 1px solid var(--color-border-strong); border-radius: 14px; background: color-mix(in srgb, var(--color-surface) 92%, transparent); backdrop-filter: blur(18px); }.scan-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }.scan-header > div { display: grid; gap: 5px; }.scan-header p { color: var(--color-text-muted); font-size: 12px; }.eyebrow { color: var(--color-primary); font-size: 12px; font-weight: 850; letter-spacing: .14em; }
.camera-frame { position: relative; width: min(100%, 300px); aspect-ratio: 1; justify-self: center; display: grid; place-items: center; overflow: hidden; border-radius: 26px; background: rgba(3, 12, 10, .08); }.camera-frame::before { content: ''; position: absolute; inset: 16px; border: 1px solid var(--color-border-strong); border-radius: 19px; }.camera-frame__mark { color: var(--color-text); opacity: .24; }.corner { position: absolute; z-index: 2; width: 42px; height: 42px; border-color: var(--color-primary); border-style: solid; }.corner--tl { top: 16px; left: 16px; border-width: 3px 0 0 3px; border-radius: 17px 0 0; }.corner--tr { top: 16px; right: 16px; border-width: 3px 3px 0 0; border-radius: 0 17px 0 0; }.corner--bl { bottom: 16px; left: 16px; border-width: 0 0 3px 3px; border-radius: 0 0 0 17px; }.corner--br { right: 16px; bottom: 16px; border-width: 0 3px 3px 0; border-radius: 0 0 17px; }.scan-line { position: absolute; z-index: 2; left: 28px; right: 28px; top: 26%; height: 2px; background: linear-gradient(90deg, transparent, var(--color-primary), transparent); box-shadow: 0 0 16px var(--color-primary); animation: scan 2.2s ease-in-out infinite alternate; }@keyframes scan { to { transform: translateY(140px); } }
.scan-status { display: flex; align-items: center; gap: 11px; padding: 12px 14px; border-radius: 14px; background: var(--color-bg-soft); }.scan-status__pulse { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: var(--color-success); box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-success) 12%, transparent); }.scan-status div { display: grid; gap: 3px; }.scan-status strong { font-size: 12px; }.scan-status p { color: var(--color-text-muted); font-size: 12px; }.privacy-note { display: flex; align-items: flex-start; gap: 10px; color: var(--color-success); }.privacy-note > span { display: grid; gap: 3px; }.privacy-note strong { color: var(--color-text-secondary); font-size: 12px; }.privacy-note small { color: var(--color-text-muted); font-size: 12px; line-height: 1.55; }.cancel-scan { width: 100%; }
.secret-panel { display: flex; align-items: center; gap: 11px; padding: 13px; border: 1px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border)); border-radius: 15px; background: var(--color-primary-soft); }.secret-panel__icon { width: 44px; height: 44px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 12px; background: var(--color-surface); color: var(--color-primary); }.secret-panel > span:nth-child(2) { min-width: 0; flex: 1; display: grid; gap: 3px; }.secret-panel small { color: var(--color-text-muted); font-size: 12px; }.secret-panel strong { overflow-wrap: anywhere; color: var(--color-primary); font-size: 12px; letter-spacing: .08em; }.review-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.span-2 { grid-column: 1 / -1; }.parameter-panel { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--color-border); border-radius: 15px; background: var(--color-bg-soft); }.parameter-panel__title { color: var(--color-text-secondary); font-size: 12px; font-weight: 750; }.grid-three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }.review-actions { display: flex; gap: 8px; padding-top: 2px; }
@media (max-width: 520px) { .scan-shell { align-items: end; padding: 0; }.scan-card { width: 100%; max-height: calc(100vh - var(--safe-top) - 10px); padding: 20px 17px calc(18px + var(--safe-bottom)); border-radius: 26px 26px 0 0; }.camera-frame { width: min(70vw, 270px); }.review-form, .grid-three { grid-template-columns: 1fr; }.span-2 { grid-column: auto; }.secret-panel .status-pill { display: none; }.review-actions { position: sticky; bottom: calc(-18px - var(--safe-bottom)); z-index: 2; margin: 0 -17px calc(-18px - var(--safe-bottom)); padding: 12px 17px calc(14px + var(--safe-bottom)); background: color-mix(in srgb, var(--color-surface) 94%, transparent); backdrop-filter: blur(12px); } }
@media (prefers-reduced-motion: reduce) { .scan-line { animation: none; top: 50%; } }
</style>
