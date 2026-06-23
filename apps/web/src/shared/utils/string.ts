export function splitList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function toQueryString(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}
