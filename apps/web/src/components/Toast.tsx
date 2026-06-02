import type { ReactNode } from "react";
import { Message, Notification } from "@alifd/next";
import "@alifd/next/lib/message/style.js";
import "@alifd/next/lib/notification/style.js";

export type ToastType = "success" | "info" | "warning" | "error" | "notice" | "help";

export type ToastInput = {
  message: string;
  type?: ToastType;
  title?: string;
  ttlMs?: number;
  persistent?: boolean;
  dedupeKey?: string;
  actionHref?: string;
  actionLabel?: string;
};

type ToastHandle = {
  close: () => void;
};

const DEFAULT_CLIENT_TTL = 3000;
const DEFAULT_SERVER_TTL = 6000;
const DEFAULT_LOADING_TTL = 0;
const DEDUPE_WINDOW_MS = 5000;
const MAX_DEDUPE_KEYS = 200;

const recentKeys = new Map<string, number>();

Message.config({
  top: 16,
  maxCount: 6,
  duration: DEFAULT_CLIENT_TTL
});

Notification.config({
  placement: "bottomRight",
  maxCount: 6,
  duration: DEFAULT_SERVER_TTL,
  offset: [16, 16]
});

export function showToast(input: ToastInput) {
  return showClientToast(input);
}

export function showServerToast(input: ToastInput) {
  const dedupeKey = rememberDedupe(input.dedupeKey);
  if (dedupeKey === null) return undefined;

  return Notification.open({
    type: mapNotificationType(input.type ?? "notice"),
    title: input.title,
    content: renderServerContent(input.message, input.actionHref, input.actionLabel),
    duration: input.persistent ? 0 : input.ttlMs ?? DEFAULT_SERVER_TTL,
    className: `crm-notification crm-notification-${input.type ?? "notice"}`
  });
}

export function showClientToast(input: ToastInput) {
  const dedupeKey = rememberDedupe(input.dedupeKey);
  if (dedupeKey === null) return undefined;

  return Message.open({
    type: mapMessageType(input.type ?? "notice"),
    title: normalizeClientTitle(input.type ?? "notice", input.title),
    content: input.message,
    duration: input.persistent ? 0 : input.ttlMs ?? DEFAULT_CLIENT_TTL,
    closeable: true
  });
}

export function showLoadingToast(input: Omit<ToastInput, "type" | "persistent" | "ttlMs">): ToastHandle | null {
  const dedupeKey = rememberDedupe(input.dedupeKey, false);
  if (dedupeKey === null) return null;

  return Message.open({
    type: "loading",
    title: input.title,
    content: input.message,
    duration: DEFAULT_LOADING_TTL,
    closeable: true
  });
}

export function notifyMutationStep(input: {
  phase: "loading" | "success" | "error";
  title?: string;
  message: string;
  dedupeKey?: string;
}) {
  if (input.phase === "loading") {
    return showLoadingToast({
      title: input.title,
      message: input.message,
      dedupeKey: input.dedupeKey
    });
  }

  if (input.phase === "success") {
    return showClientToast({
      type: "success",
      title: input.title,
      message: input.message,
      dedupeKey: input.dedupeKey
    });
  }

  return showClientToast({
    type: "error",
    title: input.title,
    message: input.message,
    dedupeKey: input.dedupeKey
  });
}

export function inferToastType(message: string): ToastType {
  const value = message.toLowerCase();
  if (
    value.includes("失败") ||
    value.includes("错误") ||
    value.includes("无效") ||
    value.includes("fail") ||
    value.includes("error") ||
    value.includes("invalid")
  ) {
    return "error";
  }

  if (
    value.includes("成功") ||
    value.includes("已") ||
    value.includes("完成") ||
    value.includes("提交") ||
    value.includes("保存") ||
    value.includes("删除") ||
    value.includes("上传") ||
    value.includes("success") ||
    value.includes("completed")
  ) {
    return "success";
  }

  if (
    value.includes("等待") ||
    value.includes("处理中") ||
    value.includes("加载") ||
    value.includes("稍后") ||
    value.includes("loading") ||
    value.includes("pending")
  ) {
    return "warning";
  }

  return "notice";
}

function rememberDedupe(rawKey?: string, shouldTrackWindow = true) {
  const dedupeKey = rawKey?.trim();
  if (!dedupeKey) return undefined;

  const now = Date.now();
  const lastAt = recentKeys.get(dedupeKey) ?? 0;
  if (shouldTrackWindow && now - lastAt < DEDUPE_WINDOW_MS) {
    return null;
  }

  if (recentKeys.size >= MAX_DEDUPE_KEYS) {
    const oldest = recentKeys.keys().next().value;
    if (oldest) recentKeys.delete(oldest);
  }

  recentKeys.set(dedupeKey, now);
  return dedupeKey;
}

function mapMessageType(type: ToastType) {
  if (type === "success") return "success" as const;
  if (type === "warning") return "warning" as const;
  if (type === "error") return "error" as const;
  if (type === "help") return "help" as const;
  return "notice" as const;
}

function mapNotificationType(type: ToastType) {
  if (type === "success") return "success" as const;
  if (type === "warning") return "warning" as const;
  if (type === "error") return "error" as const;
  if (type === "help") return "help" as const;
  return "notice" as const;
}

function normalizeClientTitle(type: ToastType, title?: string) {
  if (type === "success") return "success";
  return title;
}

function renderServerContent(message: string, actionHref?: string, actionLabel?: string): ReactNode {
  return (
    <div className="crm-notification-body">
      <div className="crm-notification-message">{message}</div>
      {actionHref && actionLabel ? (
        <div className="crm-notification-meta">
          <span />
          <a className="crm-notification-link" href={actionHref}>
            {actionLabel}
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function ToastContainer() {
  return null;
}
