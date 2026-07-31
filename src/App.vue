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
  <div class="app-shell" :class="{ 'has-navigation': showNav }">
    <aside v-if="showNav" class="app-sidebar" aria-label="主导航">
      <button class="app-brand" type="button" aria-label="进入保险箱" @click="go('/vault')">
        <span class="app-brand__mark">密</span>
        <span class="app-brand__copy">
          <strong>{{ APP_NAME }}</strong>
          <small>codebook</small>
        </span>
      </button>

      <nav class="app-sidebar__nav">
        <button
          type="button"
          class="app-sidebar__item"
          :class="{ 'is-active': activeTab === 'vault' }"
          @click="go('/vault')"
        >
          <AppIcon name="vault" />
          <span>保险箱</span>
        </button>
        <button
          type="button"
          class="app-sidebar__item"
          :class="{ 'is-active': activeTab === 'settings' }"
          @click="go('/settings')"
        >
          <AppIcon name="settings" />
          <span>设置</span>
        </button>
      </nav>

      <div class="app-sidebar__trust">
        <AppIcon name="shield" :size="18" />
        <div>
          <strong>仅保存在本机</strong>
          <span>无账号 · 无云同步</span>
        </div>
      </div>
      <p class="app-sidebar__version">v{{ APP_VERSION }}</p>
    </aside>

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
        <AppIcon name="vault" :size="21" />
        <span>保险箱</span>
      </button>
      <button
        type="button"
        class="app-bottom-nav__item"
        :class="{ 'is-active': activeTab === 'settings' }"
        @click="go('/settings')"
      >
        <AppIcon name="settings" :size="21" />
        <span>设置</span>
      </button>
    </nav>

    <p v-if="!showNav" class="app-build-tag">{{ APP_NAME }} · v{{ APP_VERSION }}</p>
  </div>
</template>
