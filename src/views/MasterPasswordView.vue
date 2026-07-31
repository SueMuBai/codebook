<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import PinField from '@/components/ui/PinField.vue'
import { MASTER_PIN_ERROR, vaultUsesMasterPin } from '@/features/security'
import { goBackOr } from '@/services/navigation/goBack'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const session = useSessionStore()
const currentPassword = ref('')
const nextPassword = ref('')
const confirmPassword = ref('')
const currentUsesPin = computed(() => vaultUsesMasterPin(session.record))

async function submit() {
  if (!currentPassword.value) return showToast(currentUsesPin.value ? '请输入当前主 PIN' : '请输入当前主密码')
  if (currentUsesPin.value && currentPassword.value.length !== 6) return showToast(MASTER_PIN_ERROR)
  if (nextPassword.value.length !== 6) return showToast(MASTER_PIN_ERROR)
  if (nextPassword.value !== confirmPassword.value) return showToast('两次输入的新主 PIN 不一致')
  if (nextPassword.value === currentPassword.value) return showToast('新主 PIN 不能与当前凭据相同')
  try {
    await session.changeMasterPassword(currentPassword.value, nextPassword.value)
    currentPassword.value = ''
    nextPassword.value = ''
    confirmPassword.value = ''
    showToast('主 PIN 已修改')
    await router.replace('/settings')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '修改失败')
  }
}
</script>

<template>
  <div class="app-page">
    <div class="page-content stack">
      <header class="page-header">
        <button class="btn-icon page-back" type="button" aria-label="返回" @click="goBackOr('/settings')"><AppIcon name="back" /></button>
        <div class="page-header__title"><h1 class="text-xl">修改主 PIN</h1><p class="text-muted text-sm">更新进入密语保险箱的 6 位数字凭据</p></div>
      </header>
      <div class="password-layout">
        <aside class="password-story">
          <span class="password-story__mark"><AppIcon name="key" :size="34" /></span>
          <span class="eyebrow">快速 · 本地 · 安全</span>
          <h2>只更换保护层，<br>不重写全部条目</h2>
          <p>密语会用新主 PIN 重新保护数据密钥，保险箱内容不会逐条重新加密，因此修改过程快速且完全在本机完成。</p>
          <div class="story-points"><span><AppIcon name="check" :size="17" />无需账号或网络</span><span><AppIcon name="check" :size="17" />条目内容保持不变</span><span><AppIcon name="check" :size="17" />完成后继续正常使用</span></div>
        </aside>
        <form class="card password-form stack" @submit.prevent="submit">
          <input type="text" name="username" value="codebook-local-vault" autocomplete="username" hidden />
          <div class="section-heading"><div class="section-heading__copy"><h2 class="section-title">验证并更新</h2><p>请先验证当前凭据，再输入新的 6 位数字主 PIN</p></div><span class="step-badge mono">01 / 01</span></div>
          <PinField v-model="currentPassword" :label="currentUsesPin ? '当前主 PIN' : '当前主密码'" placeholder="用于确认你的身份" :pin="currentUsesPin" icon="lock" autocomplete="current-password" />
          <div class="divider" />
          <PinField v-model="nextPassword" label="新主 PIN" placeholder="输入 6 位数字" icon="key" autocomplete="new-password" />
          <PinField v-model="confirmPassword" label="确认新主 PIN" placeholder="再次输入 6 位数字" icon="check" autocomplete="new-password" @enter="submit" />
          <div class="notice-panel notice-panel--warning"><AppIcon name="info" :size="20" /><span class="text-sm"><strong>旧备份不会自动更新</strong><br>现有加密备份仍使用导出时的原主 PIN 或旧主密码，请妥善保管或重新导出。</span></div>
          <button class="btn-primary submit-button" type="submit" :disabled="session.busy"><AppIcon name="shield" :size="18" />{{ session.busy ? '正在修改…' : '确认修改' }}</button>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.password-layout { display: grid; grid-template-columns: minmax(280px, .82fr) minmax(0, 1.18fr); gap: 24px; align-items: stretch; max-width: var(--form-width); margin: 0 auto; width: 100%; }
.password-story { position: relative; display: flex; flex-direction: column; justify-content: center; min-height: 520px; padding: 38px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border)); border-radius: var(--radius-large); background: radial-gradient(circle at 10% 0%, var(--color-primary-soft), transparent 44%), var(--color-surface); }
.password-story::after { content: '密'; position: absolute; right: -30px; bottom: -72px; color: var(--color-primary); font-size: 230px; font-weight: 900; line-height: 1; opacity: .035; }
.password-story__mark { width: 68px; height: 68px; display: grid; place-items: center; margin-bottom: 30px; border-radius: 22px; background: var(--color-primary-soft); color: var(--color-primary); }
.eyebrow { color: var(--color-primary); font-size: 12px; font-weight: 800; letter-spacing: .15em; }.password-story h2 { margin: 12px 0 16px; font-size: clamp(25px, 3vw, 34px); line-height: 1.25; letter-spacing: -.035em; }.password-story > p { color: var(--color-text-secondary); font-size: 13px; line-height: 1.75; }.story-points { display: grid; gap: 10px; margin-top: 28px; }.story-points span { display: flex; align-items: center; gap: 9px; color: var(--color-text-secondary); font-size: 12px; }.story-points .app-icon { color: var(--color-success); }
.password-form { justify-content: center; padding: 34px; }.step-badge { color: var(--color-text-muted); font-size: 12px; }.submit-button { width: 100%; margin-top: 4px; }
@media (max-width: 780px) { .password-layout { grid-template-columns: 1fr; } .password-story { min-height: auto; padding: 26px; }.password-story__mark { margin-bottom: 20px; } }
@media (max-width: 520px) { .password-story { padding: 22px; border-radius: 22px; }.password-form { padding: 20px; } }
</style>
