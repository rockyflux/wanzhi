import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { bookmark: true },
    },
    {
      path: '/p/:slug',
      name: 'pack',
      component: () => import('../views/HomeView.vue'),
      meta: { bookmark: true },
    },
    {
      path: '/sites/:id',
      name: 'site',
      component: () => import('../views/SiteDetailView.vue'),
      props: true,
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guest: true, bookmark: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
      meta: { guest: true, bookmark: true },
    },
    {
      path: '/me/favorites',
      name: 'favorites',
      component: () => import('../views/FavoritesView.vue'),
      meta: { auth: true, bookmark: true },
    },
    {
      path: '/me/visits',
      name: 'visits',
      component: () => import('../views/VisitsView.vue'),
      meta: { auth: true, bookmark: true },
    },
    {
      path: '/admin',
      component: () => import('../views/admin/AdminLayout.vue'),
      meta: { auth: true, admin: true, bookmark: true },
      children: [
        { path: '', redirect: '/admin/stats' },
        {
          path: 'packs',
          name: 'admin-packs',
          component: () => import('../views/admin/AdminPacks.vue'),
        },
        {
          path: 'stats',
          name: 'admin-stats',
          component: () => import('../views/admin/AdminStats.vue'),
        },
        {
          path: 'usage',
          name: 'admin-usage',
          component: () => import('../views/admin/AdminUsage.vue'),
        },
        {
          path: 'import',
          name: 'admin-import',
          component: () => import('../views/admin/AdminImport.vue'),
        },
        {
          path: 'categories',
          name: 'admin-categories',
          component: () => import('../views/admin/AdminCategories.vue'),
        },
        {
          path: 'sites',
          name: 'admin-sites',
          component: () => import('../views/admin/AdminSites.vue'),
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('../views/admin/AdminUsers.vue'),
        },
      ],
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) await auth.init()
  if (to.meta.auth && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.admin && !auth.isAdmin) {
    return { name: 'home' }
  }
  return true
})

export default router
