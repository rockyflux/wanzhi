import type { Category, ImportBatch, Pack, Site, SiteStatus } from '../types'

export type PackRow = {
  id: number | string
  slug: string
  name: string
  description: string
  icon?: string | null
  tone?: string | null
  sort_order: number
  status: number
  site_count?: number | null
}

export type CategoryRow = {
  id: number | string
  pack_id: number | string
  parent_id: number | string | null
  name: string
  level: number
  path: string
  sort_order: number
  status: number
}

export type SiteRow = {
  id: number | string
  pack_id: number | string
  category_id: number | string
  title: string
  url: string
  host?: string | null
  description?: string | null
  status: SiteStatus
  sort_order: number
  source_added_at?: string | null
}

export type ImportRow = {
  id: number | string
  pack_id: number | string | null
  filename: string
  status: ImportBatch['status']
  created_categories: number
  created_sites: number
  skipped: number
  failed: number
  notes: string[] | null
  created_at: string
  pack?: { name: string } | Array<{ name: string }> | null
}

export function num(value: number | string | null | undefined): number {
  return Number(value ?? 0)
}

export function mapPack(row: PackRow): Pack {
  return {
    id: num(row.id),
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon ?? '',
    tone: row.tone ?? '',
    sortOrder: row.sort_order,
    publishedCount: num(row.site_count),
    status: row.status === 0 ? 0 : 1,
  }
}

export function mapCategory(row: CategoryRow): Category {
  return {
    id: num(row.id),
    packId: num(row.pack_id),
    parentId: row.parent_id == null ? null : num(row.parent_id),
    name: row.name,
    level: row.level,
    path: row.path,
    sortOrder: row.sort_order,
    status: row.status === 0 ? 0 : 1,
    children: [],
  }
}

export function buildCategoryTree(rows: CategoryRow[]): Category[] {
  const nodes = rows
    .map(mapCategory)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const roots: Category[] = []
  for (const node of nodes) {
    if (node.parentId != null && byId.has(node.parentId)) {
      const parent = byId.get(node.parentId)!
      parent.children = parent.children || []
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

export function mapSite(row: SiteRow): Site {
  return {
    id: num(row.id),
    packId: num(row.pack_id),
    categoryId: num(row.category_id),
    title: row.title,
    url: row.url,
    description: row.description ?? undefined,
    status: row.status,
    sortOrder: row.sort_order,
    sourceAddedAt: row.source_added_at ?? undefined,
  }
}

export function mapImport(row: ImportRow): ImportBatch {
  const packName = Array.isArray(row.pack) ? row.pack[0]?.name : row.pack?.name
  return {
    id: num(row.id),
    packId: row.pack_id == null ? 0 : num(row.pack_id),
    packName: packName ?? '',
    filename: row.filename,
    createdAt: row.created_at,
    status: row.status,
    createdCategories: row.created_categories,
    createdSites: row.created_sites,
    skipped: row.skipped,
    failed: row.failed,
    notes: row.notes ?? [],
  }
}

export function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
