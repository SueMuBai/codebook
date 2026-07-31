import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  Button,
  Cell,
  CellGroup,
  Dialog,
  Field,
  Form,
  NavBar,
  Search,
  showToast,
  Switch,
  Tag,
} from 'vant'
import 'vant/lib/index.css'

import App from './App.vue'
import router from './app/router'
import { setupNativeLifecycle } from './app/lifecycle'
import './styles/index.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(Button)
app.use(Cell)
app.use(CellGroup)
app.use(Dialog)
app.use(Field)
app.use(Form)
app.use(NavBar)
app.use(Search)
app.use(Switch)
app.use(Tag)

// make toast helper available without importing plugin side effects in every file
app.config.globalProperties.$toast = showToast

setupNativeLifecycle()

app.mount('#app')
