<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { APP_NAME, APP_VERSION } from '@/app/version'

const route = useRoute()
const router = useRouter()
const showNav = computed(() => !route.meta.hideNav)
const activeTab = computed(() => String(route.meta.tab ?? ''))

function go(path: string) {
  if (route.path !== path) void router.push(path)
}
</script>

<template>
  <div class="app-shell">
    <main class="app-main">
      <router-view v-slot="{ Component, route: currentRoute }">
        <keep-alive>
          <component
            :is="Component"
            v-if="currentRoute.meta.keepAlive"
            :key="String(currentRoute.name)"
          />
        </keep-alive>
        <component
          :is="Component"
          v-if="!currentRoute.meta.keepAlive"
          :key="currentRoute.fullPath"
        />
      </router-view>
    </main>

    <nav v-if="showNav" class="app-bottom-nav" aria-label="主导航">
      <button
        type="button"
        class="app-bottom-nav__item"
        :class="{ 'is-active': activeTab === 'vault' }"
        @click="go('/vault')"
      >
        <span class="app-bottom-nav__icon" aria-hidden="true">▤</span>
        <span>保险箱</span>
      </button>
      <button
        type="button"
        class="app-bottom-nav__item"
        :class="{ 'is-active': activeTab === 'settings' }"
        @click="go('/settings')"
      >
        <span class="app-bottom-nav__icon" aria-hidden="true">⚙</span>
        <span>设置</span>
      </button>
    </nav>

    <p class="app-build-tag">{{ APP_NAME }} · v{{ APP_VERSION }}</p>
  </div>
</template>
