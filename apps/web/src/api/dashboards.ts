import { apiGet } from "./http";

export function getDashboardFilterOptions<T = unknown>() {
  return apiGet<T>("/dashboards/filter-options");
}

export function getMyDashboard<T = unknown>(queryString: string) {
  return apiGet<T>(`/dashboards/me${queryString}`);
}

export function getTeamDashboard<T = unknown>(queryString: string) {
  return apiGet<T>(`/dashboards/team${queryString}`);
}

export function getManagementDashboard<T = unknown>(queryString: string) {
  return apiGet<T>(`/dashboards/management${queryString}`);
}
