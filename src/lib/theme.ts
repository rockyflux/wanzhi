const THEME_KEY = 'bm-theme'

export function isDarkTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark'
  } catch {
    return false
  }
}

export function applyDocumentTheme(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
}
