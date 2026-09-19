/** Domain types for the dynamic Bookmarks site. Mock today, Supabase later. */

export type Role = 'USER' | 'ADMIN'

export interface User {
  id: string
  username: string
  nickname: string
  roles: Role[]
}

export type ProfileStatus = 'active' | 'banned'

/** Admin user list row (profiles). */
export interface ProfileUser {
  id: string
  username: string
  nickname: string
  role: 'user' | 'admin'
  status: ProfileStatus
  loginCount: number
  lastLoginAt: string | null
  createdAt: string
}

/** One themed collection, same grain as Bookmarks `pages/*.html`. */
export interface Pack {
  id: number
  slug: string
  name: string
  description: string
  /** Rail mark: Lucide kebab name (e.g. `book-open`). Empty → slug default / first char. */
  icon: string
  /** Rail mark background color. Empty → slug default / fallback. */
  tone: string
  sortOrder: number
  /** Live site scale shown on the homepage. Prototype browse data is a sample. */
  publishedCount: number
  status: 0 | 1
}

export interface Category {
  id: number
  packId: number
  parentId: number | null
  name: string
  level: number
  path: string
  sortOrder: number
  status: 0 | 1
  children?: Category[]
}

export type SiteStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE'

export interface Site {
  id: number
  packId: number
  title: string
  url: string
  description?: string
  categoryId: number
  status: SiteStatus
  sortOrder: number
  sourceAddedAt?: string
}

export interface Favorite {
  siteId: number
  createdAt: string
}

export interface VisitRecord {
  id: number
  siteId: number
  visitedAt: string
}

export interface ImportBatch {
  id: number
  packId: number
  packName: string
  filename: string
  createdAt: string
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
  createdCategories: number
  createdSites: number
  skipped: number
  failed: number
  notes: string[]
}

export interface StatsOverview {
  packCount: number
  siteCount: number
  categoryCount: number
  favoriteCount: number
  visitCount: number
  todayVisits: number
}
