import type { DashboardQueryDto } from "../dto/dashboard-query.dto";
import type { DateRange } from "../types";

export function buildDateRange(query: DashboardQueryDto, defaultMode: "month" | "last30"): DateRange {
  const now = new Date();
  const defaultFrom = defaultMode === "month" ? startOfMonth(now) : addDays(startOfDay(now), -29);
  const from = query.from ? startOfDay(new Date(query.from)) : defaultFrom;
  const to = query.to ? endOfDay(new Date(query.to)) : endOfDay(now);
  const groupBy = query.groupBy ?? query.group_by ?? inferGroupBy(from, to);
  return { from, to, groupBy };
}

export function between(range: DateRange) {
  return { gte: range.from, lte: range.to };
}

export function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

export function inferGroupBy(from: Date, to: Date): "day" | "week" | "month" {
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
  if (days <= 60) return "day";
  if (days <= 180) return "week";
  return "month";
}

export function formatBucket(date: Date, groupBy: "day" | "week" | "month") {
  const value = new Date(date);
  if (groupBy === "month") return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  if (groupBy === "week") {
    const weekStart = startOfDay(value);
    weekStart.setDate(value.getDate() - value.getDay());
    return weekStart.toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}
