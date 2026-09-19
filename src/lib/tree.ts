/** 分类树，以及列表上的日期、域名格式化。不是示例数据。 */
import type { Category, Site } from '../types'

export function flattenCategories(tree: Category[]): Category[] {
  const out: Category[] = []
  const walk = (nodes: Category[]) => {
    for (const n of nodes) {
      const { children, ...rest } = n
      out.push({ ...rest, children })
      if (children?.length) walk(children)
    }
  }
  walk(tree)
  return out
}

export function findCategory(tree: Category[], id: number): Category | null {
  for (const n of tree) {
    if (n.id === id) return n
    if (n.children?.length) {
      const hit = findCategory(n.children, id)
      if (hit) return hit
    }
  }
  return null
}

/** Ancestor chain from root to category (inclusive). */
export function categoryBreadcrumb(tree: Category[], id: number): Category[] {
  const flat = flattenCategories(tree)
  const map = new Map(flat.map((c) => [c.id, c]))
  const node = map.get(id)
  if (!node) return []
  const parts = node.path
    .split('/')
    .filter(Boolean)
    .map(Number)
    .map((cid) => map.get(cid))
    .filter(Boolean) as Category[]
  return parts
}

/** Sites under category + all descendants (by path prefix). */
export function sitesUnderCategory(
  tree: Category[],
  sites: Site[],
  categoryId: number | null,
  opts?: { publishedOnly?: boolean; directOnly?: boolean },
): Site[] {
  const publishedOnly = opts?.publishedOnly ?? true
  const directOnly = opts?.directOnly ?? false
  let filtered = sites
  if (publishedOnly) filtered = filtered.filter((s) => s.status === 'PUBLISHED')
  if (categoryId == null) return filtered.sort((a, b) => a.sortOrder - b.sortOrder)

  const cat = findCategory(tree, categoryId)
  if (!cat) return []

  if (directOnly) {
    return filtered
      .filter((s) => s.categoryId === categoryId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }

  const prefix = cat.path
  const flat = flattenCategories(tree)
  const ids = new Set(
    flat.filter((c) => c.path.startsWith(prefix)).map((c) => c.id),
  )
  return filtered
    .filter((s) => ids.has(s.categoryId))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function formatDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
