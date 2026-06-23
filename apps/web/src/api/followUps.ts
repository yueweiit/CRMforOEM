import { apiGet, apiPatch, apiPost } from "./http";

export function getFollowUpTasks<T = unknown>(status: string) {
  return apiGet<T>(`/follow-up-tasks?status=${status}`);
}

export function createFollowUpTask<T = unknown>(payload: unknown, options?: { toast?: boolean }) {
  return apiPost<T>("/follow-up-tasks", payload, options);
}

export function completeFollowUpTask<T = unknown>(id: string, options?: { toast?: boolean }) {
  return apiPost<T>(`/follow-up-tasks/${id}/complete`, undefined, options);
}

export function cancelFollowUpTask<T = unknown>(id: string, options?: { toast?: boolean }) {
  return apiPatch<T>(`/follow-up-tasks/${id}`, { status: "CANCELLED" }, options);
}
