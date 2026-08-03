import { describe, expect, it } from 'vitest'
import { router } from '@/app/router'

describe('application routes', () => {
  it('exposes every v1 target page', () => {
    const names = new Set(router.getRoutes().map((route) => route.name))
    for (const name of [
      'lock',
      'onboarding',
      'vault',
      'entry-new',
      'entry-detail',
      'entry-edit',
      'categories',
      'settings',
      'import-export',
      'master-password',
    ]) {
      expect(names.has(name)).toBe(true)
    }
  })

  it('resets document scrolling on navigation and restores browser history positions', async () => {
    const scrollBehavior = router.options.scrollBehavior
    expect(scrollBehavior).toBeTypeOf('function')

    expect(await scrollBehavior?.({} as never, {} as never, null)).toEqual({ top: 0 })

    const savedPosition = { left: 12, top: 34 }
    expect(await scrollBehavior?.({} as never, {} as never, savedPosition)).toEqual(savedPosition)
  })
})
