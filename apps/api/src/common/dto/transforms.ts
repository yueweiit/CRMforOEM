import type { TransformFnParams } from "class-transformer";

export function trimBlankToUndefined({ value }: TransformFnParams) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
