import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { applyDocumentTheme, isDarkTheme } from './lib/theme'
import './styles/main.css'
import './styles/bookmarks.css'

applyDocumentTheme(isDarkTheme())

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  await useAuthStore(pinia).init()
  app.use(router).mount('#app')
}

void bootstrap()
