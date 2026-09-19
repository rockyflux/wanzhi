import type { Category } from '../types'

const PREFIX = 'bm-cat-v1:'
/** Safety cap within a tab session; sessionStorage already clears when the tab closes. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000

export type PackCategoryCache = {
  packId: number
  updatedAt: number
  tree: Category[]
  counts: Record<number, number>
}

function key(packId: number) {
  return `${PREFIX}${packId}`
}

/** Drop any leftover localStorage entries from the previous cache strategy. */
function purgeLegacyLocalCache(packId: number) {
  try {
    localStorage.removeItem(key(packId))
  } catch {
    // ignore
  }
}

export function readPackCategoryCache(packId: number): PackCategoryCache | null {
  purgeLegacyLocalCache(packId)
  try {
    const raw = sessionStorage.getItem(key(packId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PackCategoryCache
    if (!parsed || Number(parsed.packId) !== Number(packId) || !Array.isArray(parsed.tree)) {
      return null
    }
    if (Date.now() - Number(parsed.updatedAt || 0) > MAX_AGE_MS) {
      sessionStorage.removeItem(key(packId))
      return null
    }
    return {
      packId: Number(parsed.packId),
      updatedAt: Number(parsed.updatedAt) || 0,
      tree: parsed.tree,
      counts: parsed.counts && typeof parsed.counts === 'object' ? parsed.counts : {},
    }
  } catch {
    return null
  }
}

export function writePackCategoryCache(
  packId: number,
  tree: Category[],
  counts: Record<number, number>,
) {
  try {
    const payload: PackCategoryCache = {
      packId: Number(packId),
      updatedAt: Date.now(),
      tree,
      counts,
    }
    sessionStorage.setItem(key(packId), JSON.stringify(payload))
  } catch {
    // Quota / private mode — ignore
  }
}

export function clearPackCategoryCache(packId: number) {
  try {
    sessionStorage.removeItem(key(packId))
  } catch {
    // ignore
  }
}
