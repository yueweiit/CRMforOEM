export function parseDurationSeconds(value: string, fallbackSeconds = 7 * 24 * 60 * 60): number {
  const match = value.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return fallbackSeconds;
  const num = Number(match[1]);
  switch (match[2]) {
    case "s": return num;
    case "m": return num * 60;
    case "h": return num * 60 * 60;
    case "d": return num * 24 * 60 * 60;
    default: return fallbackSeconds;
  }
}
