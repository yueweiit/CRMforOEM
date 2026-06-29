import type { QueryClient } from "@tanstack/react-query";

export function cleanPayload(input: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value));
}

export function invalidateEmailData(queryClient: QueryClient, customerId: string, onChanged: () => void) {
  queryClient.invalidateQueries({ queryKey: ["email-drafts", customerId] });
  queryClient.invalidateQueries({ queryKey: ["email-threads", customerId] });
  onChanged();
}
