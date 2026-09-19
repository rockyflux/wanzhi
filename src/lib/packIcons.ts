/** Background colors for the home rail `.hs-mark`. */
export const PACK_TONE_PRESETS = [
  '#ff5a1f',
  '#2a9d8f',
  '#3d5a80',
  '#bc4749',
  '#6a994e',
  '#0077b6',
  '#7f5539',
  '#1d3557',
  '#9b2226',
  '#588157',
  '#e09f3e',
  '#386641',
  '#0D5C63',
  '#E07A5F',
] as const

/** Frequently used Lucide names shown first in the picker. */
export const PACK_ICON_SUGGESTIONS = [
  'bookmark',
  'library',
  'book-open',
  'cookie',
  'app-window',
  'gamepad-2',
  'graduation-cap',
  'wrench',
  'cloud',
  'briefcase',
  'palette',
  'files',
  'compass',
  'search',
  'globe',
  'link',
  'star',
  'heart',
  'folder',
  'folder-open',
  'file-text',
  'code',
  'terminal',
  'cpu',
  'database',
  'server',
  'hard-drive',
  'download',
  'upload',
  'image',
  'music',
  'film',
  'tv',
  'headphones',
  'camera',
  'pen-tool',
  'brush',
  'layers',
  'layout-grid',
  'layout-dashboard',
  'notepad-text',
  'clipboard-list',
  'calendar',
  'mail',
  'message-circle',
  'users',
  'user',
  'settings',
  'sliders-horizontal',
  'shield',
  'lock',
  'key',
  'map',
  'map-pin',
  'navigation',
  'rocket',
  'sparkles',
  'zap',
  'lightbulb',
  'puzzle',
  'boxes',
  'package',
  'shopping-bag',
  'gift',
  'coffee',
  'utensils',
  'plane',
  'car',
  'bike',
  'train',
  'building-2',
  'home',
  'school',
  'microscope',
  'flask-conical',
  'atom',
  'brain',
  'chart-column',
  'trending-up',
  'wallet',
  'credit-card',
  'receipt',
  'printer',
  'monitor',
  'smartphone',
  'tablet',
  'wifi',
  'bluetooth',
  'radio',
  'podcast',
  'newspaper',
  'rss',
  'github',
  'gitlab',
  'figma',
  'chrome',
] as const

const SLUG_TONE: Record<string, string> = {
  wuzhi: '#ff5a1f',
  cheese: '#2a9d8f',
  software: '#3d5a80',
  entertainment: '#bc4749',
  study: '#6a994e',
  tools: '#0077b6',
  cloud: '#7f5539',
  work: '#1d3557',
  design: '#9b2226',
  office: '#588157',
  academic: '#e09f3e',
  explore: '#386641',
}

const SLUG_ICON: Record<string, string> = {
  wuzhi: 'library',
  cheese: 'cookie',
  software: 'app-window',
  entertainment: 'gamepad-2',
  study: 'book-open',
  tools: 'wrench',
  cloud: 'cloud',
  work: 'briefcase',
  design: 'palette',
  office: 'files',
  academic: 'graduation-cap',
  explore: 'compass',
}

const LUCIDE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/** Normalize stored value to a Lucide kebab-case name, or empty. */
export function normalizePackIcon(icon: string | undefined | null): string {
  const raw = (icon || '').trim().toLowerCase()
  if (!raw) return ''
  const bare = raw.startsWith('lucide:') ? raw.slice(7) : raw
  return LUCIDE_NAME.test(bare) ? bare : ''
}

export function isLucideIcon(icon: string | undefined | null): boolean {
  return Boolean(normalizePackIcon(icon))
}

/** Iconify id used by `<Icon icon="…" />`. */
export function packIconifyId(icon: string | undefined | null, slug = ''): string {
  const name = normalizePackIcon(icon) || SLUG_ICON[slug] || 'bookmark'
  return `lucide:${name}`
}

/** Fallback glyph when the value is not a Lucide name (legacy 1–2 chars). */
export function packMarkFallback(icon: string | undefined, name: string) {
  const custom = (icon || '').trim()
  if (custom && !normalizePackIcon(custom)) {
    return [...custom].slice(0, 2).join('')
  }
  return name.trim().slice(0, 1) || '签'
}

export function packTone(tone: string | undefined, slug: string) {
  const custom = (tone || '').trim()
  if (custom) return custom
  return SLUG_TONE[slug] || '#1b4332'
}

export function defaultPackIcon(slug: string) {
  return SLUG_ICON[slug] || 'bookmark'
}

let lucideNamesCache: string[] | null = null

/** Lazy-load full Lucide name list for the admin picker. */
export async function loadLucideIconNames(): Promise<string[]> {
  if (lucideNamesCache) return lucideNamesCache
  const { icons } = await import('@iconify-json/lucide')
  lucideNamesCache = Object.keys(icons.icons).sort()
  return lucideNamesCache
}