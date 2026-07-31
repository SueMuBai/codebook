<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { APP_NAME } from '@/app/version'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const password = ref('')

onMounted(async () => {
  if (session.status === 'booting') await session.bootstrap()
})

async function unlock() {
  if (!password.value) return showToast('请输入主密码')
  try {
    await session.unlock(password.value)
    password.value = ''
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/vault'
    await router.replace(redirect)
  } catch {
    showToast(session.errorMessage || '解锁失败')
  }
}

async function resetLegacy() {
  try {
    await showConfirmDialog({
      title: '清空旧版开发数据',
      message: '旧版 v1 数据与正式 v2 格式不兼容。清空后无法恢复。',
      confirmButtonText: '清空并重新创建',
      confirmButtonColor: '#d84f61',
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
  <div class="app-page app-page--centered">
    <form class="placeholder-card stack lock-card" @submit.prevent="unlock">
      <div class="brand-mark" aria-hidden="true">密</div>
      <div>
        <h1 class="text-display">{{ APP_NAME }}</h1>
        <p class="text-secondary text-sm">本地加密 · 安静守护</p>
      </div>

      <template v-if="session.status === 'locked' || session.status === 'booting'">
        <label>
          <span class="field-label">主密码</span>
          <input
            v-model="password"
            class="input"
            type="password"
            autocomplete="current-password"
            placeholder="输入主密码解锁"
            :disabled="session.busy"
            @keyup.enter="unlock"
          />
        </label>
        <button class="btn-primary" type="submit" :disabled="session.busy">
          {{ session.busy ? '正在解锁…' : '解锁' }}
        </button>
      </template>

      <template v-else-if="session.status === 'legacy_reset_required'">
        <div class="notice stack">
          <strong>检测到旧版开发数据</strong>
          <p class="text-secondary text-sm">正式 v2 格式不兼容旧数据，需要清空后重新创建。</p>
        </div>
        <button class="btn-danger" type="button" @click="resetLegacy">清空旧数据</button>
      </template>

      <template v-else-if="session.status === 'fatal'">
        <p class="danger-text text-sm">{{ session.errorMessage || '初始化失败' }}</p>
        <button class="btn-ghost" type="button" @click="retryBootstrap">重试</button>
      </template>

      <p v-if="session.errorMessage && session.status === 'locked'" class="danger-text text-sm">
        {{ session.errorMessage }}
      </p>
    </form>
  </div>
</template>

<style scoped>
.lock-card { gap: var(--space-5); }
.brand-mark { width: 58px; height: 58px; display: grid; place-items: center; border-radius: 18px; background: var(--color-primary); color: var(--color-on-primary); font-size: 25px; font-weight: 800; }
.notice { padding: var(--space-4); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-warning) 10%, transparent); }
</style>
