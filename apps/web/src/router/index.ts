import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";
import AppLayout from "../layouts/AppLayout.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/",
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: "",
          name: "dashboard",
          component: () => import("../views/DashboardView.vue"),
        },
        {
          path: "casos",
          name: "casos",
          component: () => import("../views/CasosView.vue"),
        },
        {
          path: "flujo",
          name: "flujo",
          component: () => import("../views/FlujoView.vue"),
        },
        {
          path: "casos/:id/expediente",
          name: "caso-expediente",
          component: () => import("../views/ExpedienteView.vue"),
        },
        {
          path: "casos/:id/revision",
          name: "caso-revision",
          component: () => import("../views/RevisionView.vue"),
        },
        {
          path: "casos/:id/informe",
          name: "caso-informe",
          component: () => import("../views/InformeView.vue"),
        },
        {
          path: "repositorio",
          name: "repositorio",
          component: () => import("../views/RepositorioView.vue"),
        },
        {
          path: "comparacion",
          name: "comparacion",
          component: () => import("../views/ComparacionView.vue"),
        },
        {
          path: "consolidacion",
          name: "consolidacion",
          component: () => import("../views/ConsolidacionView.vue"),
        },
        {
          path: "contribuyentes",
          name: "contribuyentes",
          component: () => import("../views/ContribuyentesView.vue"),
        },
        {
          path: "admin",
          name: "admin",
          component: () => import("../views/admin/AdminView.vue"),
        },
        {
          path: "admin/plan-cuentas",
          name: "admin-plan-cuentas",
          component: () => import("../views/admin/PlanCuentasView.vue"),
        },
        {
          path: "admin/usuarios",
          name: "admin-usuarios",
          component: () => import("../views/admin/AdminUsersView.vue"),
        },
        {
          path: "admin/operacion",
          name: "admin-operacion",
          component: () => import("../views/admin/AdminOperacionView.vue"),
        },
        {
          path: "admin/ia-uso",
          name: "admin-ia-uso",
          component: () => import("../views/admin/AdminIaUsoView.vue"),
        },
      ],
    },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.user && !to.meta.public) {
    await auth.restoreSession();
  }
  if (to.meta.requiresAuth && !auth.user) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.name === "login" && auth.user) {
    return { name: "dashboard" };
  }
});

export default router;
