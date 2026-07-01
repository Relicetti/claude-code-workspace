import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'

// The installed home-screen icon kept serving a stale cached build even
// after new versions were deployed. Take manual control of the service
// worker instead of relying on the plugin's default injected script:
// activate a waiting update immediately (no stuck-on-old-version limbo),
// and re-check for updates every time the app is reopened/foregrounded,
// since that's the moment a phone is most likely to have missed one.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const checkForUpdate = () => registration.update().catch(() => {})
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    })
    window.addEventListener('focus', checkForUpdate)
  },
  onNeedRefresh() {
    updateSW(true)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
