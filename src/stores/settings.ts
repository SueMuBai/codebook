import { computed } from 'vue'
import { defineStore } from 'pinia'
import type { AppSettings } from '@/types/domain'
import { useSessionStore } from './session'

export const useSettingsStore = defineStore('settings', () => {
  const session = useSessionStore()
  const settings = computed(() => session.settings)

  async function update(partial: Partial<AppSettings>): Promise<void> {
    await session.saveSettings({ ...session.settings, ...partial })
  }

  return { settings, update }
})
