<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { APP_NAME } from '@/app/version'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const session = useSessionStore()
const password = ref('')
const confirmPassword = ref('')

const strength = computed(() => {
  const value = password.value
  let score = 0
  if (value.length >= 8) score += 1
  if (value.length >= 12) score += 1
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1
  if (/\d/.test(value) && /[^\w]/.test(value)) score += 1
  return ['过短', '一般', '较好', '强', '很强'][score]!
})

async function createVault() {
  if (password.value.length < 8) return showToast('主密码至少需要 8 位')
  if (password.value !== confirmPassword.value) return showToast('两次输入的主密码不一致')
  try {
    await session.setup(password.value)
    password.value = ''
    confirmPassword.value = ''
    await router.replace('/vault')
  } catch {
    showToast(session.errorMessage || '创建失败')
  }
}
</script>

<template>
  <div class="app-page app-page--centered">
    <form class="placeholder-card stack onboarding-card" @submit.prevent="createVault">
      <div class="brand-mark" aria-hidden="true">密</div>
      <div class="stack intro">
        <h1 class="text-display">欢迎使用{{ APP_NAME }}</h1>
        <p class="text-secondary">创建只属于你的本地加密保险箱。</p>
      </div>

      <label>
        <span class="field-label">主密码</span>
        <input
          v-model="password"
          class="input"
          type="password"
          autocomplete="new-password"
          placeholder="至少 8 位"
        />
      </label>
      <div class="split text-sm">
        <span class="text-muted">强度</span>
        <span :class="password.length >= 12 ? 'success-text' : 'warning-text'">{{ strength }}</span>
      </div>
      <label>
        <span class="field-label">确认主密码</span>
        <input
          v-model="confirmPassword"
          class="input"
          type="password"
          autocomplete="new-password"
          placeholder="再次输入"
          @keyup.enter="createVault"
        />
      </label>

      <div class="notice text-sm">
        主密码不会上传，也无法找回。忘记主密码意味着永久失去保险箱数据。
      </div>
      <button class="btn-primary" type="submit" :disabled="session.busy">
        {{ session.busy ? '正在创建…' : '创建保险箱' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.onboarding-card { gap: var(--space-4); }
.brand-mark { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 18px; background: var(--color-primary); color: var(--color-on-primary); font-size: 25px; font-weight: 800; }
.intro { gap: 6px; }
.notice { padding: 12px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-warning) 10%, transparent); color: var(--color-text-secondary); line-height: 1.55; text-align: left; }
</style>
