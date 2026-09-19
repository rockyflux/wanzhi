import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  buildCategoryTree,
  hostFromUrl,
  mapImport,
  mapPack,
  mapSite,
  type CategoryRow,
  type ImportRow,
  type PackRow,
  type SiteRow,
} from '../lib/mappers'
import {
  clearPackCategoryCache,
  readPackCategoryCache,
  writePackCategoryCache,
} from '../lib/categoryCache'
import { normalizePackIcon } from '../lib/packIcons'
import { supabase } from '../lib/supabase'
import {
  categoryBreadcrumb,
  findCategory,
  flattenCategories,
  sitesUnderCategory,
} from '../lib/tree'
import type { Category, Favorite, ImportBatch, Pack, Site, SiteStatus, VisitRecord } from '../types'
import { useAuthStore } from './auth'

function slugify(raw: string) {
  const ascii = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return ascii || `pack-${Date.now()}`
}

function throwOn(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export type PackInput = {
  name: string
  slug: string
  description?: string
  icon?: string
  tone?: string
  sortOrder?: number
  status?: 0 | 1
}

const PACK_COLS = 'id, slug, name, description, icon, tone, sort_order, status'

/** Catalog backed by Supabase. Homepage/pack reads are live; admin writes go to Postgres. */
export const useCatalogStore = defineStore('catalog', () => {
  const packs = ref<Pack[]>([])
  const categories = ref<Category[]>([])
  const sites = ref<Site[]>([])
  const favorites = ref<Favorite[]>([])
  const visits = ref<VisitRecord[]>([])
  const imports = ref<ImportBatch[]>([])
  const selectedCategoryId = ref<number | null>(null)
  const loading = ref(false)
  const error = ref('')
  const countsByCategory = ref<Record<number, number>>({})
  const loadedPackId = ref<number | null>(null)
  const favoriteSitesCache = ref<Site[]>([])
  const visitRowsCache = ref<Array<VisitRecord & { site?: Site }>>([])
  const adminStats = ref({
    packCount: 0,
    siteCount: 0,
    categoryCount: 0,
    favoriteCount: 0,
    visitCount: 0,
    todayVisits: 0,
  })

  const flatCategories = computed(() => flattenCategories(categories.value))

  const selectedCategory = computed(() =>
    selectedCategoryId.value == null
      ? null
      : findCategory(categories.value, selectedCategoryId.value),
  )

  const breadcrumb = computed(() =>
    selectedCategoryId.value == null
      ? []
      : categoryBreadcrumb(categories.value, selectedCategoryId.value),
  )

  const stats = computed(() => adminStats.value)

  function treeOf(packId: number) {
    const pid = Number(packId)
    return categories.value.filter((c) => c.packId === pid)
  }

  function sitesOf(packId: number) {
    return sites.value.filter((s) => s.packId === packId)
  }

  function cardCount(pack: Pack) {
    return pack.publishedCount
  }

  function countInCategory(categoryId: number) {
    const cat = findCategory(categories.value, categoryId)
    if (!cat) return 0
    const flat = flattenCategories([cat])
    return flat.reduce((sum, node) => sum + (countsByCategory.value[node.id] ?? 0), 0)
  }

  function directSites(categoryId: number | null) {
    return sitesUnderCategory(categories.value, sites.value, categoryId, {
      publishedOnly: true,
      directOnly: true,
    })
  }

  function packById(id: number) {
    return packs.value.find((p) => p.id === id)
  }

  function getSite(id: number) {
    return sites.value.find((s) => s.id === id)
  }

  function isFavorited(siteId: number) {
    return favorites.value.some((f) => f.siteId === siteId)
  }

  async function loadPacks() {
    loading.value = true
    error.value = ''
    const { data, error: err } = await supabase
      .from('pack_public')
      .select('id, slug, name, description, icon, tone, sort_order, site_count')
      .order('sort_order')
    loading.value = false
    if (err) {
      error.value = err.message
      throw err
    }
    packs.value = (data as PackRow[]).map((row) =>
      mapPack({ ...row, status: 1, site_count: row.site_count ?? 0 }),
    )
  }

  function applyPackCategories(
    packId: number,
    tree: Category[],
    counts: Record<number, number>,
    opts?: { persist?: boolean },
  ) {
    const pid = Number(packId)
    const prevIds = new Set(flattenCategories(treeOf(pid)).map((c) => c.id))
    categories.value = [...categories.value.filter((c) => c.packId !== pid), ...tree]
    const nextCounts = { ...countsByCategory.value }
    for (const id of prevIds) delete nextCounts[id]
    Object.assign(nextCounts, counts)
    countsByCategory.value = nextCounts
    if (opts?.persist !== false) writePackCategoryCache(pid, tree, counts)
  }

  function persistPackCategorySnapshot(packId: number) {
    const pid = Number(packId)
    const tree = treeOf(pid)
    const counts: Record<number, number> = {}
    for (const c of flattenCategories(tree)) {
      if (countsByCategory.value[c.id] != null) counts[c.id] = countsByCategory.value[c.id]
    }
    writePackCategoryCache(pid, tree, counts)
  }

  async function fetchPackCategories(packId: number) {
    const pid = Number(packId)
    const [{ data: catRows, error: catErr }, { data: countRows, error: countErr }] =
      await Promise.all([
        supabase
          .from('category')
          .select('id, pack_id, parent_id, name, level, path, sort_order, status')
          .eq('pack_id', pid)
          .order('sort_order'),
        supabase.rpc('category_counts', { p_pack_id: pid }),
      ])
    throwOn(catErr)
    throwOn(countErr)
    const tree = buildCategoryTree((catRows ?? []) as CategoryRow[])
    const counts: Record<number, number> = {}
    for (const row of (countRows ?? []) as Array<{
      category_id: number | string
      direct_count: number
    }>) {
      counts[Number(row.category_id)] = Number(row.direct_count)
    }
    applyPackCategories(pid, tree, counts)
    return tree
  }

  function ensureSelectedCategory(packId: number) {
    const tree = treeOf(packId)
    const selected = selectedCategoryId.value
    if (selected == null || !findCategory(tree, selected)) {
      selectedCategoryId.value = tree[0]?.id ?? null
    }
  }

  async function loadPackDetail(slug: string) {
    loading.value = true
    error.value = ''
    try {
      const { data: packRow, error: packErr } = await supabase
        .from('pack_public')
        .select('id, slug, name, description, icon, tone, sort_order, site_count')
        .eq('slug', slug)
        .maybeSingle()
      throwOn(packErr)
      if (!packRow) {
        categories.value = []
        sites.value = []
        countsByCategory.value = {}
        loadedPackId.value = null
        selectedCategoryId.value = null
        return null
      }
      const pack = mapPack({ ...(packRow as PackRow), status: 1 })
      const idx = packs.value.findIndex((p) => p.id === pack.id)
      if (idx >= 0) packs.value[idx] = pack
      else packs.value.push(pack)

      loadedPackId.value = pack.id

      const memTree = treeOf(pack.id)
      const cached = memTree.length
        ? {
            tree: memTree,
            counts: Object.fromEntries(
              flattenCategories(memTree).map((c) => [c.id, countsByCategory.value[c.id] ?? 0]),
            ),
          }
        : readPackCategoryCache(pack.id)

      if (cached?.tree?.length) {
        if (!memTree.length) applyPackCategories(pack.id, cached.tree, cached.counts, { persist: false })
        ensureSelectedCategory(pack.id)
        const sitesPromise =
          selectedCategoryId.value != null
            ? loadSitesForCategory(selectedCategoryId.value)
            : Promise.resolve()
        loading.value = false
        // Stale-while-revalidate: refresh categories in background
        void fetchPackCategories(pack.id).catch(() => {
          /* keep cache on soft failure */
        })
        await sitesPromise
        return pack
      }

      await fetchPackCategories(pack.id)
      ensureSelectedCategory(pack.id)
      if (selectedCategoryId.value != null) await loadSitesForCategory(selectedCategoryId.value)
      return pack
    } finally {
      loading.value = false
    }
  }

  async function loadSitesForCategory(categoryId: number) {
    if (loadedPackId.value == null) return
    const { data, error: err } = await supabase
      .from('site')
      .select(
        'id, pack_id, category_id, title, url, host, description, status, sort_order, source_added_at',
      )
      .eq('pack_id', loadedPackId.value)
      .eq('category_id', categoryId)
      .eq('status', 'PUBLISHED')
      .order('sort_order')
      .limit(500)
    throwOn(err)
    const mapped = ((data ?? []) as SiteRow[]).map(mapSite)
    sites.value = [
      ...sites.value.filter((s) => !(s.packId === loadedPackId.value && s.categoryId === categoryId)),
      ...mapped,
    ]
  }

  async function searchSites(packId: number, query: string) {
    const q = query.trim()
    if (!q) return [] as Site[]
    const { data, error: err } = await supabase
      .from('site')
      .select(
        'id, pack_id, category_id, title, url, host, description, status, sort_order, source_added_at',
      )
      .eq('pack_id', packId)
      .eq('status', 'PUBLISHED')
      .or(`title.ilike.%${q}%,host.ilike.%${q}%`)
      .limit(60)
    throwOn(err)
    return ((data ?? []) as SiteRow[]).map(mapSite)
  }

  async function enterPack(slug: string) {
    return loadPackDetail(slug)
  }

  async function selectCategory(id: number | null) {
    selectedCategoryId.value = id
    if (id != null) await loadSitesForCategory(id)
  }

  async function loadFavorites() {
    const auth = useAuthStore()
    if (!auth.user) {
      favorites.value = []
      favoriteSitesCache.value = []
      return
    }
    const { data, error: err } = await supabase
      .from('favorite')
      .select(
        'site_id, created_at, site:site(id, pack_id, category_id, title, url, host, description, status, sort_order, source_added_at)',
      )
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
    throwOn(err)
    favorites.value = (data ?? []).map((row) => ({
      siteId: Number(row.site_id),
      createdAt: row.created_at as string,
    }))
    favoriteSitesCache.value = (data ?? [])
      .map((row) => {
        const site = Array.isArray(row.site) ? row.site[0] : row.site
        return site ? mapSite(site as SiteRow) : null
      })
      .filter(Boolean) as Site[]
  }

  async function loadVisits() {
    const auth = useAuthStore()
    if (!auth.user) {
      visits.value = []
      visitRowsCache.value = []
      return
    }
    const { data, error: err } = await supabase
      .from('visit_record')
      .select(
        'id, site_id, visited_at, site:site(id, pack_id, category_id, title, url, host, description, status, sort_order, source_added_at)',
      )
      .eq('user_id', auth.user.id)
      .order('visited_at', { ascending: false })
      .limit(200)
    throwOn(err)
    visits.value = (data ?? []).map((row) => ({
      id: Number(row.id),
      siteId: Number(row.site_id),
      visitedAt: row.visited_at as string,
    }))
    visitRowsCache.value = (data ?? []).map((row) => {
      const site = Array.isArray(row.site) ? row.site[0] : row.site
      return {
        id: Number(row.id),
        siteId: Number(row.site_id),
        visitedAt: row.visited_at as string,
        site: site ? mapSite(site as SiteRow) : undefined,
      }
    })
  }

  async function toggleFavorite(siteId: number) {
    const auth = useAuthStore()
    if (!auth.user) return { ok: false, message: '请先登录后再收藏' }
    if (isFavorited(siteId)) {
      const { error: err } = await supabase
        .from('favorite')
        .delete()
        .eq('user_id', auth.user.id)
        .eq('site_id', siteId)
      throwOn(err)
      favorites.value = favorites.value.filter((f) => f.siteId !== siteId)
      favoriteSitesCache.value = favoriteSitesCache.value.filter((s) => s.id !== siteId)
      return { ok: true, message: '已取消收藏' }
    }
    const { error: err } = await supabase.from('favorite').insert({
      user_id: auth.user.id,
      site_id: siteId,
    })
    throwOn(err)
    favorites.value.unshift({ siteId, createdAt: new Date().toISOString() })
    const existing = getSite(siteId)
    if (existing) favoriteSitesCache.value.unshift(existing)
    return { ok: true, message: '已收藏' }
  }

  async function recordVisit(siteId: number) {
    const auth = useAuthStore()
    if (!auth.user) return
    const { data, error: err } = await supabase
      .from('visit_record')
      .insert({ user_id: auth.user.id, site_id: siteId })
      .select('id, site_id, visited_at')
      .single()
    if (err) return
    visits.value.unshift({
      id: Number(data.id),
      siteId: Number(data.site_id),
      visitedAt: data.visited_at,
    })
  }

  async function openSite(site: Site) {
    await recordVisit(site.id)
    window.open(site.url, '_blank', 'noopener,noreferrer')
  }

  function favoriteSites() {
    return favoriteSitesCache.value
  }

  function visitRows() {
    return visitRowsCache.value
  }

  async function loadAdminCatalog() {
    const [{ data: packRows, error: packErr }, { data: catRows, error: catErr }, { data: siteRows, error: siteErr }] =
      await Promise.all([
        supabase.from('pack').select(PACK_COLS).order('sort_order'),
        supabase
          .from('category')
          .select('id, pack_id, parent_id, name, level, path, sort_order, status')
          .order('sort_order')
          .limit(10000),
        supabase
          .from('site')
          .select(
            'id, pack_id, category_id, title, url, host, description, status, sort_order, source_added_at',
          )
          .order('id', { ascending: false })
          .limit(2000),
      ])
    throwOn(packErr)
    throwOn(catErr)
    throwOn(siteErr)
    packs.value = ((packRows ?? []) as PackRow[]).map((row) => mapPack({ ...row, site_count: 0 }))
    categories.value = buildCategoryTree((catRows ?? []) as CategoryRow[])
    sites.value = ((siteRows ?? []) as SiteRow[]).map(mapSite)
    const { data: countRows } = await supabase.from('pack_public').select('id, site_count')
    const countMap = new Map(
      ((countRows ?? []) as Array<{ id: number | string; site_count?: number | null }>).map((row) => [
        Number(row.id),
        Number(row.site_count ?? 0),
      ]),
    )
    for (const pack of packs.value) {
      pack.publishedCount =
        countMap.get(pack.id) ??
        sites.value.filter((s) => s.packId === pack.id && s.status === 'PUBLISHED').length
      persistPackCategorySnapshot(pack.id)
    }
  }

  /** Load (or refresh) categories for one pack without wiping other packs' trees. */
  async function loadCategoriesForPack(packId: number, opts?: { force?: boolean }) {
    const pid = Number(packId)
    if (!opts?.force) {
      const mem = treeOf(pid)
      if (mem.length) return mem
      const cached = readPackCategoryCache(pid)
      if (cached?.tree?.length) {
        applyPackCategories(pid, cached.tree, cached.counts, { persist: false })
        void fetchPackCategories(pid).catch(() => {
          /* keep cache */
        })
        return cached.tree
      }
    }
    return fetchPackCategories(pid)
  }

  async function loadImports() {
    const { data, error: err } = await supabase
      .from('bookmark_import')
      .select(
        'id, pack_id, filename, status, created_categories, created_sites, skipped, failed, notes, created_at, pack:pack(name)',
      )
      .order('created_at', { ascending: false })
      .limit(50)
    throwOn(err)
    imports.value = ((data ?? []) as ImportRow[]).map(mapImport)
  }

  async function loadStats() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const [
      { count: packCount },
      { count: siteCount },
      { count: categoryCount },
      { count: favoriteCount },
      { count: visitCount },
      { count: todayVisits },
    ] = await Promise.all([
      supabase.from('pack').select('*', { count: 'exact', head: true }),
      supabase.from('site').select('*', { count: 'exact', head: true }).eq('status', 'PUBLISHED'),
      supabase.from('category').select('*', { count: 'exact', head: true }),
      supabase.from('favorite').select('*', { count: 'exact', head: true }),
      supabase.from('visit_record').select('*', { count: 'exact', head: true }),
      supabase
        .from('visit_record')
        .select('*', { count: 'exact', head: true })
        .gte('visited_at', today.toISOString()),
    ])
    adminStats.value = {
      packCount: packCount ?? 0,
      siteCount: siteCount ?? 0,
      categoryCount: categoryCount ?? 0,
      favoriteCount: favoriteCount ?? 0,
      visitCount: visitCount ?? 0,
      todayVisits: todayVisits ?? 0,
    }
  }

  async function upsertSite(
    payload: Partial<Site> & { title: string; url: string; categoryId: number },
  ) {
    const cat = findCategory(categories.value, payload.categoryId)
    if (!cat) throw new Error('请选择文件夹')
    const row = {
      pack_id: cat.packId,
      category_id: payload.categoryId,
      title: payload.title,
      url: payload.url,
      host: hostFromUrl(payload.url),
      description: payload.description ?? null,
      status: (payload.status as SiteStatus) || 'PUBLISHED',
      sort_order: payload.sortOrder ?? 0,
      source_added_at: payload.sourceAddedAt ?? new Date().toISOString(),
    }
    if (payload.id) {
      const { data, error: err } = await supabase
        .from('site')
        .update(row)
        .eq('id', payload.id)
        .select(
          'id, pack_id, category_id, title, url, host, description, status, sort_order, source_added_at',
        )
        .single()
      throwOn(err)
      const mapped = mapSite(data as SiteRow)
      const i = sites.value.findIndex((s) => s.id === mapped.id)
      if (i >= 0) sites.value[i] = mapped
      else sites.value.unshift(mapped)
      return
    }
    const { data, error: err } = await supabase
      .from('site')
      .insert(row)
      .select(
        'id, pack_id, category_id, title, url, host, description, status, sort_order, source_added_at',
      )
      .single()
    throwOn(err)
    sites.value.unshift(mapSite(data as SiteRow))
  }

  async function setSiteStatus(id: number, status: SiteStatus) {
    const { error: err } = await supabase.from('site').update({ status }).eq('id', id)
    throwOn(err)
    const s = sites.value.find((x) => x.id === id)
    if (s) s.status = status
  }

  async function deleteSite(id: number) {
    const { error: err } = await supabase.from('site').delete().eq('id', id)
    throwOn(err)
    sites.value = sites.value.filter((s) => s.id !== id)
    favorites.value = favorites.value.filter((f) => f.siteId !== id)
  }

  async function addCategory(parentId: number | null, name: string, packId?: number) {
    const parent = parentId == null ? null : findCategory(categories.value, parentId)
    const pid = parent?.packId ?? packId
    if (!pid) throw new Error('请选择专题')
    if (parent && packId && parent.packId !== packId) throw new Error('父文件夹不属于该专题')
    const { data, error: err } = await supabase
      .from('category')
      .insert({
        pack_id: pid,
        parent_id: parentId,
        name,
        sort_order: parent?.children?.length ?? treeOf(pid).length,
      })
      .select('id, pack_id, parent_id, name, level, path, sort_order, status')
      .single()
    throwOn(err)
    await loadAdminCatalog()
    const created = findCategory(categories.value, Number((data as CategoryRow).id))!
    persistPackCategorySnapshot(created.packId)
    return created
  }

  async function renameCategory(id: number, name: string) {
    const { error: err } = await supabase.from('category').update({ name }).eq('id', id)
    throwOn(err)
    const c = findCategory(categories.value, id)
    if (c) {
      c.name = name
      persistPackCategorySnapshot(c.packId)
    }
  }

  async function removeCategory(id: number) {
    const c = findCategory(categories.value, id)
    if (!c) return { ok: false, message: '分类不存在' }
    if (c.children?.length) return { ok: false, message: '请先删除子文件夹' }
    const { count } = await supabase
      .from('site')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)
    if ((count ?? 0) > 0) return { ok: false, message: '文件夹下仍有网址，无法删除' }
    const { error: err } = await supabase.from('category').delete().eq('id', id)
    if (err) return { ok: false, message: err.message }
    const packId = c.packId
    await loadAdminCatalog()
    persistPackCategorySnapshot(packId)
    return { ok: true, message: '已删除' }
  }

  async function createPack(name: string, slug: string, description = '从书签 HTML 导入') {
    return savePack({ name, slug, description, status: 1 })
  }

  async function savePack(input: PackInput, id?: number) {
    const clean = slugify(input.slug || input.name)
    const row = {
      slug: clean,
      name: input.name.trim() || clean,
      description: input.description ?? '',
      icon: normalizePackIcon(input.icon),
      tone: (input.tone ?? '').trim(),
      status: input.status ?? 1,
    }
    const sortOrder = input.sortOrder ?? (id ? null : packs.value.length + 1)
    const payload = sortOrder == null ? row : { ...row, sort_order: sortOrder }
    if (id) {
      const { data, error: err } = await supabase
        .from('pack')
        .update(payload)
        .eq('id', id)
        .select(PACK_COLS)
        .single()
      throwOn(err)
      const pack = mapPack({ ...(data as PackRow), site_count: packById(id)?.publishedCount ?? 0 })
      const i = packs.value.findIndex((p) => p.id === pack.id)
      if (i >= 0) packs.value[i] = pack
      else packs.value.push(pack)
      packs.value.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      return pack
    }
    const { data, error: err } = await supabase
      .from('pack')
      .insert(payload)
      .select(PACK_COLS)
      .single()
    throwOn(err)
    const pack = mapPack({ ...(data as PackRow), site_count: 0 })
    packs.value.push(pack)
    packs.value.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    return pack
  }

  async function deletePack(id: number) {
    const { count } = await supabase
      .from('site')
      .select('*', { count: 'exact', head: true })
      .eq('pack_id', id)
    if ((count ?? 0) > 0) return { ok: false as const, message: '专题下仍有网址，无法删除' }
    const { error: err } = await supabase.from('pack').delete().eq('id', id)
    if (err) return { ok: false as const, message: err.message }
    packs.value = packs.value.filter((p) => p.id !== id)
    categories.value = categories.value.filter((c) => c.packId !== id)
    clearPackCategoryCache(id)
    return { ok: true as const, message: '已删除' }
  }

  async function clearPackContent(packId: number) {
    const { error: siteErr } = await supabase.from('site').delete().eq('pack_id', packId)
    throwOn(siteErr)
    const { error: catErr } = await supabase.from('category').delete().eq('pack_id', packId)
    throwOn(catErr)
    sites.value = sites.value.filter((s) => s.packId !== packId)
    categories.value = categories.value.filter((c) => c.packId !== packId)
    clearPackCategoryCache(packId)
  }

  async function importBookmarkHtml(
    filename: string,
    html: string,
    target: { packId: number; replace?: boolean } | { name: string; slug: string },
  ): Promise<ImportBatch> {
    let pack: Pack
    try {
      if ('packId' in target) {
        const found = packById(target.packId)
        if (!found) throw new Error('专题不存在')
        if (target.replace) await clearPackContent(found.id)
        pack = found
      } else {
        pack = await createPack(target.name, target.slug)
      }
    } catch (e) {
      const batch: ImportBatch = {
        id: 0,
        packId: 0,
        packName: 'name' in target ? target.name : '',
        filename,
        createdAt: new Date().toISOString(),
        status: 'FAILED',
        createdCategories: 0,
        createdSites: 0,
        skipped: 0,
        failed: 1,
        notes: [e instanceof Error ? e.message : '无法确定专题'],
      }
      imports.value.unshift(batch)
      return batch
    }

    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    let createdCategories = 0
    let createdSites = 0
    let skipped = 0
    let failed = 0
    const notes: string[] = []
    const existing = new Set(
      sites.value.filter((s) => s.packId === pack.id).map((s) => s.url.replace(/\/$/, '')),
    )
    const { data: existingRows } = await supabase.from('site').select('url').eq('pack_id', pack.id)
    for (const row of existingRows ?? []) existing.add(String(row.url).replace(/\/$/, ''))

    const rootDl = doc.querySelector('dl')
    if (!rootDl) {
      notes.push('未识别到 Netscape 书签结构（缺少 DL）')
      const { data } = await supabase
        .from('bookmark_import')
        .insert({
          pack_id: pack.id,
          filename,
          status: 'FAILED',
          notes,
          failed: 1,
        })
        .select(
          'id, pack_id, filename, status, created_categories, created_sites, skipped, failed, notes, created_at',
        )
        .single()
      const batch = mapImport({ ...(data as ImportRow), pack: { name: pack.name } })
      imports.value.unshift(batch)
      return batch
    }

    const walk = async (dl: Element, parentId: number | null) => {
      for (const dt of Array.from(dl.children)) {
        if (dt.tagName !== 'DT') continue
        const h3 = dt.querySelector(':scope > h3')
        const a = dt.querySelector(':scope > a')
        if (h3) {
          const folderName = h3.textContent?.trim() || '未命名文件夹'
          const node = await addCategory(parentId, folderName, pack.id)
          createdCategories++
          let childDl = dt.querySelector(':scope > dl')
          if (!childDl && dt.nextElementSibling?.tagName === 'DL') childDl = dt.nextElementSibling
          if (childDl) await walk(childDl, node.id)
        } else if (a) {
          const href = a.getAttribute('href') || ''
          const title = a.textContent?.trim() || href
          if (!href || href.startsWith('javascript:')) {
            failed++
            notes.push(`跳过非法链接: ${title}`)
            continue
          }
          const norm = href.replace(/\/$/, '')
          if (existing.has(norm)) {
            skipped++
            continue
          }
          if (parentId == null) {
            failed++
            notes.push(`无父文件夹，跳过: ${title}`)
            continue
          }
          let description: string | undefined
          const dd = dt.nextElementSibling
          if (dd?.tagName === 'DD') description = dd.textContent?.trim()
          existing.add(norm)
          await upsertSite({
            title,
            url: href,
            description,
            categoryId: parentId,
            status: 'PUBLISHED',
            sortOrder: createdSites,
          })
          createdSites++
        }
      }
    }

    await walk(rootDl, null)
    notes.push('已忽略 ICON。五万级请用 scripts/import_bookmarks.py，不要在此页一次导入。')
    const status: ImportBatch['status'] =
      failed && !createdSites ? 'FAILED' : failed || skipped ? 'PARTIAL' : 'SUCCESS'
    const { data, error: err } = await supabase
      .from('bookmark_import')
      .insert({
        pack_id: pack.id,
        filename,
        status,
        created_categories: createdCategories,
        created_sites: createdSites,
        skipped,
        failed,
        notes,
      })
      .select(
        'id, pack_id, filename, status, created_categories, created_sites, skipped, failed, notes, created_at',
      )
      .single()
    throwOn(err)
    await loadPacks()
    await fetchPackCategories(pack.id)
    const batch = mapImport({ ...(data as ImportRow), pack: { name: pack.name } })
    imports.value.unshift(batch)
    return batch
  }

  return {
    packs,
    categories,
    sites,
    favorites,
    visits,
    imports,
    selectedCategoryId,
    loading,
    error,
    flatCategories,
    selectedCategory,
    breadcrumb,
    stats,
    treeOf,
    sitesOf,
    cardCount,
    countInCategory,
    directSites,
    enterPack,
    selectCategory,
    isFavorited,
    toggleFavorite,
    recordVisit,
    openSite,
    favoriteSites,
    visitRows,
    packById,
    upsertSite,
    setSiteStatus,
    deleteSite,
    addCategory,
    renameCategory,
    removeCategory,
    createPack,
    savePack,
    deletePack,
    importBookmarkHtml,
    getSite,
    loadPacks,
    loadPackDetail,
    loadSitesForCategory,
    searchSites,
    loadFavorites,
    loadVisits,
    loadAdminCatalog,
    loadCategoriesForPack,
    loadImports,
    loadStats,
  }
})
