<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
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
  <div v-if="show" class="scan-shell" role="dialog" aria-modal="true" aria-label="扫描 TOTP 二维码">
    <section class="scan-card stack">
      <template v-if="stage === 'scanning'">
        <div class="scan-mark" aria-hidden="true">⌗</div>
        <h2 class="text-xl">扫描 2FA 二维码</h2>
        <p class="text-secondary text-sm">{{ status }}</p>
        <p class="text-muted text-sm">图像只在本机解析，不上传、不保存。也可以取消后手工输入。</p>
        <button class="btn-ghost" type="button" @click="close">取消扫码</button>
      </template>

      <template v-else>
        <div>
          <h2 class="text-xl">确认 TOTP</h2>
          <p class="text-muted text-sm">确认后只加入条目草稿，仍需保存条目。</p>
        </div>
        <p v-if="scannedPlainSecret" class="warning-box text-sm">检测到密钥文本，而不是 otpauth URI。请核对来源和参数后再添加。</p>
        <div class="secret-preview mono">{{ maskedSecret }}</div>
        <label><span class="field-label">标签</span><input v-model="label" class="input" placeholder="例如：主账号" /></label>
        <label><span class="field-label">Issuer</span><input v-model="issuer" class="input" /></label>
        <label><span class="field-label">账号名</span><input v-model="scannedAccountName" class="input" /></label>
        <div class="grid-three">
          <label><span class="field-label">位数</span><select v-model.number="digits" class="select"><option :value="6">6</option><option :value="7">7</option><option :value="8">8</option></select></label>
          <label><span class="field-label">周期</span><input v-model.number="period" class="input" type="number" min="1" max="300" /></label>
          <label><span class="field-label">算法</span><select v-model="algorithm" class="select"><option value="SHA1">SHA-1</option><option value="SHA256">SHA-256</option><option value="SHA512">SHA-512</option></select></label>
        </div>
        <div class="cluster">
          <button class="btn-primary grow" type="button" @click="confirm">添加到草稿</button>
          <button class="btn-ghost" type="button" @click="close">取消</button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.scan-shell { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: var(--space-4); background: rgba(4, 7, 16, 0.86); backdrop-filter: blur(12px); visibility: visible; }
.scan-card { width: min(100%, 520px); max-height: calc(100vh - 32px); overflow-y: auto; padding: var(--space-5); border-radius: var(--radius-card); background: var(--color-surface); border: 1px solid var(--color-border); }
.scan-mark { width: 68px; height: 68px; display: grid; place-items: center; border: 2px solid var(--color-primary); border-radius: 22px; color: var(--color-primary); font-size: 36px; }
.secret-preview { padding: 14px; border-radius: var(--radius-sm); text-align: center; background: var(--color-bg-soft); color: var(--color-primary); }
.warning-box { padding: 12px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-warning) 12%, transparent); color: var(--color-text-secondary); }
.grid-three { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
@media (max-width: 520px) { .grid-three { grid-template-columns: 1fr; } }
</style>
