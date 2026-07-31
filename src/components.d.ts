declare module 'vue' {
  export interface GlobalComponents {
    AppIcon: typeof import('./components/ui/AppIcon.vue')['default']
  }
}

export {}
