/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __BUILD_TIME__: string
declare const __BUILD_COMMIT__: string
declare const __APP_VERSION__: string
