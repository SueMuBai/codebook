<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { APP_NAME } from '@/app/version'
import PinField from '@/components/ui/PinField.vue'
import { MASTER_PIN_ERROR } from '@/features/security'
import { offerBiometricSetupIfNeeded } from '@/services/secure/biometricOffer'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const session = useSessionStore()
const password = ref('')
const confirmPassword = ref('')

const pinProgress = computed(() => password.value.length)

async function createVault() {
  if (password.value.length !== 6) return showToast(MASTER_PIN_ERROR)
  if (password.value !== confirmPassword.value) return showToast('两次输入的主 PIN 不一致')
  try {
    await session.setup(password.value)
    password.value = ''
    confirmPassword.value = ''
    await router.replace('/vault')
    const offered = await offerBiometricSetupIfNeeded(session)
    if (offered === 'enabled') showToast('指纹或人脸解锁已开启')
    else if (offered === 'failed') showToast('未能启用生物识别，可稍后在设置中开启')
  } catch {
    showToast(session.errorMessage || '创建失败')
  }
}
</script>

<template>
  <div class="app-page auth-page">
    <div class="auth-layout">
      <section class="auth-story">
        <div class="auth-brand"><span class="brand-mark">密</span><span>{{ APP_NAME }} <small>codebook</small></span></div>
        <div class="auth-story__copy">
          <p class="eyebrow">PRIVATE BY DESIGN</p>
          <h1 class="text-display">你的凭据，<br />只属于你。</h1>
          <p>在设备本地建立加密保险箱。没有账号，没有云端，也没有第三方能够替你打开它。</p>
        </div>
        <ul class="feature-list">
          <li><span><AppIcon name="lock" /></span><div><strong>本地强加密</strong><small>主 PIN 保护随机数据密钥</small></div></li>
          <li><span><AppIcon name="shield" /></span><div><strong>无账号系统</strong><small>不注册，不上传，不追踪</small></div></li>
          <li><span><AppIcon name="file" /></span><div><strong>备份由你掌控</strong><small>加密 JSON 可离线迁移</small></div></li>
        </ul>
      </section>

      <form class="auth-panel" @submit.prevent="createVault">
        <input type="text" name="username" value="codebook-local-vault" autocomplete="username" hidden />
        <div class="auth-panel__heading">
          <span class="auth-panel__icon"><AppIcon name="vault" :size="24" /></span>
          <div><p class="eyebrow">SET UP</p><h2>创建保险箱</h2><p>设置 6 位数字主 PIN，开始保存你的登录信息。</p></div>
        </div>

        <PinField v-model="password" label="6 位数字主 PIN" placeholder="输入 6 位数字" autocomplete="new-password" />
        <div class="strength-block" aria-live="polite">
          <div class="strength-track"><span :style="{ width: `${pinProgress / 6 * 100}%` }" /></div>
          <div class="split text-sm"><span class="text-muted">输入进度</span><strong :class="pinProgress === 6 ? 'success-text' : 'warning-text'">{{ pinProgress }} / 6</strong></div>
        </div>
        <PinField v-model="confirmPassword" label="确认主 PIN" placeholder="再次输入 6 位数字" autocomplete="new-password" @enter="createVault" />

        <div class="notice-panel notice-panel--warning text-sm"><AppIcon name="info" :size="18" /><span>主 PIN 不会上传，也无法找回。遗忘后只能清空本地数据重新创建。</span></div>
        <button class="btn-primary auth-submit" type="submit" :disabled="session.busy"><AppIcon name="lock" :size="18" />{{ session.busy ? '正在创建…' : '创建本地保险箱' }}</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.auth-page { display: grid; place-items: center; }
.auth-layout { width: min(100%, 1040px); display: grid; gap: 28px; }
.auth-story { display: flex; flex-direction: column; gap: 34px; padding: 12px 4px; }
.auth-brand { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 780; }
.auth-brand small { margin-left: 5px; color: var(--color-text-muted); font-size: 12px; font-weight: 680; letter-spacing: .14em; text-transform: uppercase; }
.brand-mark { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 16px; background: linear-gradient(145deg, var(--color-primary), var(--color-primary-strong)); color: var(--color-on-primary); box-shadow: 0 14px 34px color-mix(in srgb, var(--color-primary) 26%, transparent); font-size: 21px; font-weight: 850; }
.auth-story__copy { display: grid; gap: 15px; }
.auth-story__copy > p:last-child { max-width: 540px; color: var(--color-text-secondary); font-size: 16px; line-height: 1.75; }
.feature-list { display: grid; gap: 10px; }
.feature-list li { display: flex; align-items: center; gap: 13px; padding: 12px; border: 1px solid var(--color-border); border-radius: 16px; background: color-mix(in srgb, var(--color-surface) 62%, transparent); }
.feature-list li > span { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 12px; background: var(--color-primary-soft); color: var(--color-primary); }
.feature-list div { display: grid; gap: 2px; }
.feature-list strong { font-size: 13px; }
.feature-list small { color: var(--color-text-muted); font-size: 12px; }
.auth-panel { display: flex; flex-direction: column; gap: 18px; padding: 24px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-large); background: color-mix(in srgb, var(--color-surface) 96%, transparent); box-shadow: var(--shadow-float); }
.auth-panel__heading { display: flex; gap: 14px; margin-bottom: 2px; }
.auth-panel__icon { flex: 0 0 48px; height: 48px; display: grid; place-items: center; border-radius: 15px; background: var(--color-primary-soft); color: var(--color-primary); }
.auth-panel__heading h2 { margin-top: 3px; font-size: 24px; letter-spacing: -.03em; }
.auth-panel__heading div > p:last-child { margin-top: 5px; color: var(--color-text-muted); font-size: 12px; line-height: 1.5; }
.strength-block { display: grid; gap: 7px; margin-top: -8px; }
.strength-track { height: 5px; overflow: hidden; border-radius: 99px; background: var(--color-bg-subtle); }
.strength-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--color-warning), var(--color-success)); transition: width var(--transition-base); }
.auth-submit { width: 100%; }
@media (min-width: 820px) { .auth-layout { grid-template-columns: 1.08fr .92fr; align-items: center; } .feature-list { grid-template-columns: repeat(3, 1fr); } .feature-list li { align-items: flex-start; flex-direction: column; } .auth-panel { padding: 30px; } }
@media (max-width: 819px) { .auth-story__copy h1 br { display: none; } .feature-list { display: none; } }
</style>
