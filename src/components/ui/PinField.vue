<script setup lang="ts">
import { ref, watch } from 'vue'
import { normalizeMasterPinInput } from '@/features/security'

const props = withDefaults(
  defineProps<{
    label: string
    placeholder?: string
    autocomplete?: 'current-password' | 'new-password'
    /** PIN mode restricts input to 6 digits; false allows legacy free-text passwords. */
    pin?: boolean
    icon?: string
    disabled?: boolean
  }>(),
  {
    placeholder: '',
    autocomplete: 'current-password',
    pin: true,
    icon: undefined,
    disabled: false,
  },
)

const model = defineModel<string>({ required: true })
const emit = defineEmits<{ enter: [] }>()
const show = ref(false)

watch(
  [model, () => props.pin],
  ([value, pinMode]) => {
    if (!pinMode) return
    const normalized = normalizeMasterPinInput(value)
    if (value !== normalized) model.value = normalized
  },
  { immediate: true },
)
</script>

<template>
  <label class="pin-field">
    <span class="field-label">{{ label }}</span>
    <span class="pin-field__control" :class="{ 'has-icon': icon }">
      <AppIcon v-if="icon" :name="icon" :size="18" class="pin-field__icon" />
      <input
        v-model="model"
        class="input"
        :class="{ mono: pin }"
        :type="show ? 'text' : 'password'"
        :inputmode="pin ? 'numeric' : 'text'"
        :pattern="pin ? '[0-9]*' : undefined"
        :autocomplete="autocomplete"
        :placeholder="placeholder"
        :disabled="disabled"
        @keyup.enter="emit('enter')"
      />
      <button
        type="button"
        class="pin-field__toggle"
        :aria-label="show ? `隐藏${label}` : `显示${label}`"
        @click="show = !show"
      >
        <AppIcon :name="show ? 'eyeOff' : 'eye'" :size="18" />
      </button>
    </span>
  </label>
</template>

<style scoped>
.pin-field { display: block; }
.pin-field__control { position: relative; display: block; }
.pin-field__icon { position: absolute; z-index: 1; left: 14px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); }
.pin-field__control .input { padding-right: 50px; }
.pin-field__control.has-icon .input { padding-left: 43px; }
.pin-field__toggle { position: absolute; right: 3px; top: 3px; width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: transparent; color: var(--color-text-muted); cursor: pointer; }
</style>
