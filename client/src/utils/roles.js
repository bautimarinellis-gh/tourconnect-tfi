const DASHBOARD_BY_ROLE = {
  admin: '/admin/dashboard',
  mayorista: '/mayorista/dashboard',
  agencia: '/agencia/dashboard',
};

export const getDashboardPathForRole = (rol) => DASHBOARD_BY_ROLE[rol] ?? '/login';
