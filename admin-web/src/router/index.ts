import { createRouter, createWebHistory } from 'vue-router';

import { useSessionStore } from '../stores/session';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('../layouts/DefaultLayout.vue'),
      children: [
        { path: '', redirect: '/dashboard' },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('../views/dashboard/DashboardView.vue'),
        },
        {
          path: 'communities',
          name: 'communities',
          component: () => import('../views/communities/CommunityListView.vue'),
        },
        {
          path: 'stores',
          name: 'stores',
          component: () => import('../views/stores/StoreListView.vue'),
        },
        {
          path: 'products',
          name: 'products',
          component: () => import('../views/products/ProductListView.vue'),
        },
        {
          path: 'delivery',
          name: 'delivery',
          component: () => import('../views/delivery/DeliveryConfigView.vue'),
        },
        {
          path: 'orders',
          name: 'orders',
          component: () => import('../views/orders/OrderListView.vue'),
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('../views/users/UserListView.vue'),
        },
        {
          path: 'refunds',
          name: 'refunds',
          component: () => import('../views/refunds/RefundListView.vue'),
        },
        {
          path: 'alerts',
          name: 'alerts',
          component: () => import('../views/alerts/AlertListView.vue'),
        },
        {
          path: 'operation-logs',
          name: 'operation-logs',
          component: () => import('../views/operations/OperationLogListView.vue'),
        },
      ],
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/login/LoginView.vue'),
      meta: { public: true },
    },
  ],
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  if (to.meta.public) {
    return session.isAuthenticated && to.name === 'login' ? { name: 'dashboard' } : true;
  }
  if (!session.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (!session.admin) {
    try {
      await session.restore();
    } catch {
      return { name: 'login', query: { redirect: to.fullPath } };
    }
  }
  return true;
});

export default router;
