import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/lock' },
  {
    path: '/lock',
    name: 'lock',
    component: () => import('@/views/LockView.vue'),
    meta: { hideNav: true, public: true },
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('@/views/OnboardingView.vue'),
    meta: { hideNav: true, public: true },
  },
  {
    path: '/vault',
    name: 'vault',
    component: () => import('@/views/VaultListView.vue'),
    meta: { keepAlive: true, tab: 'vault', requiresUnlock: true },
  },
  {
    path: '/vault/new',
    name: 'entry-new',
    component: () => import('@/views/EntryEditView.vue'),
    meta: { hideNav: true, requiresUnlock: true },
  },
  {
    path: '/vault/:id',
    name: 'entry-detail',
    component: () => import('@/views/EntryDetailView.vue'),
    meta: { hideNav: true, requiresUnlock: true },
  },
  {
    path: '/vault/:id/edit',
    name: 'entry-edit',
    component: () => import('@/views/EntryEditView.vue'),
    meta: { hideNav: true, requiresUnlock: true },
  },
  {
    path: '/categories',
    name: 'categories',
    component: () => import('@/views/CategoriesView.vue'),
    meta: { hideNav: true, requiresUnlock: true },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { keepAlive: true, tab: 'settings', requiresUnlock: true },
  },
  {
    path: '/settings/import-export',
    name: 'import-export',
    component: () => import('@/views/ImportExportView.vue'),
    meta: { hideNav: true, requiresUnlock: true },
  },
  {
    path: '/settings/master-password',
    name: 'master-password',
    component: () => import('@/views/MasterPasswordView.vue'),
    meta: { hideNav: true, requiresUnlock: true },
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (session.status === 'booting') await session.bootstrap()

  if (to.meta.requiresUnlock && !session.isUnlocked) {
    return { name: 'lock', query: { redirect: to.fullPath } }
  }
  if (session.isUnlocked && (to.name === 'lock' || to.name === 'onboarding')) {
    return { name: 'vault' }
  }
  if (to.name === 'lock' && session.status === 'needs_setup') return { name: 'onboarding' }
  if (to.name === 'onboarding' && session.status !== 'needs_setup') return { name: 'lock' }
  return true
})

export default router
