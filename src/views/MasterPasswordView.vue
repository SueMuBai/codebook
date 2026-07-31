<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const session = useSessionStore()
const currentPassword = ref('')
const nextPassword = ref('')
const confirmPassword = ref('')
const showPasswords = ref(false)

async function submit() {
  if (!currentPassword.value) return showToast('请输入当前主密码')
  if (nextPassword.value.length < 8) return showToast('新主密码至少需要 8 位')
  if (nextPassword.value !== confirmPassword.value) return showToast('两次输入的新主密码不一致')
  if (nextPassword.value === currentPassword.value) return showToast('新主密码不能与当前密码相同')
  try {
    await session.changeMasterPassword(currentPassword.value, nextPassword.value)
    currentPassword.value = ''
    nextPassword.value = ''
    confirmPassword.value = ''
    showToast('主密码已修改')
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
        <button class="btn-icon page-back" type="button" aria-label="返回" @click="router.back()"><AppIcon name="back" /></button>
        <div class="page-header__title"><h1 class="text-xl">修改主密码</h1><p class="text-muted text-sm">更新进入密语保险箱的唯一凭据</p></div>
      </header>
      <div class="password-layout">
        <aside class="password-story">
          <span class="password-story__mark"><AppIcon name="key" :size="34" /></span>
          <span class="eyebrow">快速 · 本地 · 安全</span>
          <h2>只更换保护层，<br>不重写全部条目</h2>
          <p>密语会用新主密码重新保护数据密钥，保险箱内容不会逐条重新加密，因此修改过程快速且完全在本机完成。</p>
          <div class="story-points"><span><AppIcon name="check" :size="17" />无需账号或网络</span><span><AppIcon name="check" :size="17" />条目内容保持不变</span><span><AppIcon name="check" :size="17" />完成后继续正常使用</span></div>
        </aside>
        <form class="card password-form stack" @submit.prevent="submit">
          <input type="text" name="username" value="codebook-local-vault" autocomplete="username" hidden />
          <div class="section-heading"><div class="section-heading__copy"><h2 class="section-title">验证并更新</h2><p>请先验证当前主密码，再输入新的主密码</p></div><span class="step-badge mono">01 / 01</span></div>
          <label><span class="field-label">当前主密码</span><span class="field-with-icon"><AppIcon name="lock" :size="18" /><input v-model="currentPassword" class="input" :type="showPasswords ? 'text' : 'password'" autocomplete="current-password" placeholder="用于确认你的身份" /><button type="button" :aria-label="showPasswords ? '隐藏密码' : '显示密码'" @click="showPasswords = !showPasswords"><AppIcon :name="showPasswords ? 'eyeOff' : 'eye'" :size="18" /></button></span></label>
          <div class="divider" />
          <label><span class="field-label">新主密码</span><span class="field-with-icon"><AppIcon name="key" :size="18" /><input v-model="nextPassword" class="input" :type="showPasswords ? 'text' : 'password'" autocomplete="new-password" placeholder="至少 8 位，建议使用长密码" /><button type="button" :aria-label="showPasswords ? '隐藏密码' : '显示密码'" @click="showPasswords = !showPasswords"><AppIcon :name="showPasswords ? 'eyeOff' : 'eye'" :size="18" /></button></span></label>
          <label><span class="field-label">确认新主密码</span><span class="field-with-icon"><AppIcon name="check" :size="18" /><input v-model="confirmPassword" class="input" :type="showPasswords ? 'text' : 'password'" autocomplete="new-password" placeholder="再次输入新主密码" @keyup.enter="submit" /><button type="button" :aria-label="showPasswords ? '隐藏密码' : '显示密码'" @click="showPasswords = !showPasswords"><AppIcon :name="showPasswords ? 'eyeOff' : 'eye'" :size="18" /></button></span></label>
          <div class="notice-panel notice-panel--warning"><AppIcon name="info" :size="20" /><span class="text-sm"><strong>旧备份不会自动更新</strong><br>现有加密备份仍使用导出时的旧主密码，请妥善保管或重新导出。</span></div>
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
.password-form { justify-content: center; padding: 34px; }.step-badge { color: var(--color-text-muted); font-size: 12px; }.field-with-icon { position: relative; display: block; }.field-with-icon > .app-icon { position: absolute; z-index: 1; left: 14px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); }.field-with-icon .input { padding-left: 43px; padding-right: 50px; }.field-with-icon button { position: absolute; right: 3px; top: 3px; width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: transparent; color: var(--color-text-muted); cursor: pointer; }.submit-button { width: 100%; margin-top: 4px; }
@media (max-width: 780px) { .password-layout { grid-template-columns: 1fr; } .password-story { min-height: auto; padding: 26px; }.password-story__mark { margin-bottom: 20px; } }
@media (max-width: 520px) { .password-story { padding: 22px; border-radius: 22px; }.password-form { padding: 20px; } }
</style>
