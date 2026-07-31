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
        <button class="btn-ghost" type="button" @click="router.back()">返回</button>
        <div class="page-header__title"><h1 class="text-xl">修改主密码</h1></div>
      </header>
      <form class="card stack" @submit.prevent="submit">
        <p class="text-secondary text-sm">修改主密码只会重新保护数据密钥，不会重新加密全部条目。</p>
        <label><span class="field-label">当前主密码</span><input v-model="currentPassword" class="input" type="password" autocomplete="current-password" /></label>
        <label><span class="field-label">新主密码</span><input v-model="nextPassword" class="input" type="password" autocomplete="new-password" placeholder="至少 8 位" /></label>
        <label><span class="field-label">确认新主密码</span><input v-model="confirmPassword" class="input" type="password" autocomplete="new-password" @keyup.enter="submit" /></label>
        <div class="warning-box text-sm">修改完成后，现有加密备份仍使用导出时的旧主密码。</div>
        <button class="btn-primary" type="submit" :disabled="session.busy">{{ session.busy ? '正在修改…' : '确认修改' }}</button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.warning-box { padding: 12px; border-radius: var(--radius-sm); color: var(--color-text-secondary); background: color-mix(in srgb, var(--color-warning) 10%, transparent); }
</style>
