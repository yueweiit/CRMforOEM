import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { AlertTriangle, CheckCircle2, Info, Mail, XCircle } from "lucide-react";

export type ToastType = "success" | "info" | "warning" | "error";

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

type ToastRecord = Required<Pick<ToastInput, "message" | "type" | "persistent">> &
  Omit<ToastInput, "message" | "type"> & {
    id: number;
    createdAt: number;
  };

const MAX_TOASTS = 8;
const DEFAULT_CLIENT_TTL = 10_000;
const DEDUPE_WINDOW_MS = 5000;
const MAX_DEDUPE_KEYS = 200;

let toastId = 0;
const listeners = new Set<(toast: ToastRecord) => void>();
const recentKeys = new Map<string, number>();
const pendingToasts: ToastRecord[] = [];

export function showToast(input: ToastInput) {
  const now = Date.now();
  const dedupeKey = input.dedupeKey?.trim();
  if (dedupeKey) {
    const lastAt = recentKeys.get(dedupeKey) ?? 0;
    if (now - lastAt < DEDUPE_WINDOW_MS) {
      return;
    }
    if (recentKeys.size >= MAX_DEDUPE_KEYS) {
      const oldest = recentKeys.keys().next().value;
      if (oldest) recentKeys.delete(oldest);
    }
    recentKeys.set(dedupeKey, now);
  }

  const toast: ToastRecord = {
    id: ++toastId,
    type: input.type ?? "info",
    message: input.message,
    title: input.title,
    ttlMs: input.persistent ? undefined : (input.ttlMs ?? DEFAULT_CLIENT_TTL),
    persistent: input.persistent ?? false,
    dedupeKey,
    actionHref: input.actionHref,
    actionLabel: input.actionLabel,
    createdAt: now
  };

  if (!listeners.size) {
    pendingToasts.push(toast);
    return;
  }

  listeners.forEach((fn) => fn(toast));
}

export function showServerToast(input: Omit<ToastInput, "persistent" | "ttlMs"> & Pick<ToastInput, "ttlMs">) {
  showToast({
    ...input,
    persistent: true
  });
}

export function showClientToast(input: ToastInput) {
  showToast({
    ...input,
    persistent: false,
    ttlMs: input.ttlMs ?? DEFAULT_CLIENT_TTL
  });
}

function toastIcon(type: ToastType, title?: string) {
  if (type === "success") return <CheckCircle2 size={18} />;
  if (type === "warning") return <AlertTriangle size={18} />;
  if (type === "error") return <XCircle size={18} />;
  if (title?.includes("邮件")) return <Mail size={18} />;
  return <Info size={18} />;
}

function formatToastTime(createdAt: number) {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const addToast = useCallback((toast: ToastRecord) => {
    setToasts((prev) => {
      const next = [...prev, toast];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });

    if (!toast.persistent && toast.ttlMs) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== toast.id));
      }, toast.ttlMs);
    }
  }, []);

  useEffect(() => {
    listeners.add(addToast);
    if (pendingToasts.length) {
      const queued = [...pendingToasts];
      pendingToasts.length = 0;
      queued.forEach((toast) => addToast(toast));
    }
    return () => {
      listeners.delete(addToast);
    };
  }, [addToast]);

  if (!toasts.length) return null;

  const visibleToasts = toasts.slice(-MAX_TOASTS);
  const stackHeight = 132 + Math.max(0, visibleToasts.length - 1) * 18;

  return (
    <div className="toast-container" aria-live="polite" style={{ height: `${stackHeight}px` }}>
      {visibleToasts.map((toast, index) => {
        const depth = Math.max(visibleToasts.length - index - 1, 0);
        const isHovered = hoveredId === toast.id;
        const translateX = depth * -18 + (isHovered ? -12 : 0);
        const translateY = depth * -16 + (isHovered ? -10 : 0);
        const scale = isHovered ? 1.02 : 1 - depth * 0.035;
        const style = {
          "--stack-depth": depth,
          zIndex: isHovered ? 500 : 100 + index,
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          opacity: hoveredId !== null && !isHovered ? Math.max(0.56, 1 - depth * 0.14) : Math.max(0.72, 1 - depth * 0.12)
        } as CSSProperties;

        return (
          <div
            key={toast.id}
            style={style}
            className={`toast ${toast.type} ${toast.persistent ? "is-persistent" : "is-ephemeral"}`}
            role={toast.type === "error" ? "alert" : "status"}
            aria-live={toast.type === "error" ? "assertive" : "polite"}
            onMouseEnter={() => setHoveredId(toast.id)}
            onMouseLeave={() => setHoveredId((current) => (current === toast.id ? null : current))}
          >
            <span className="toast-icon">{toastIcon(toast.type, toast.title)}</span>
            <div className="toast-copy">
              <div className="toast-head">
                {toast.title ? <strong>{toast.title}</strong> : null}
                <time className="toast-time" dateTime={new Date(toast.createdAt).toISOString()}>
                  {formatToastTime(toast.createdAt)}
                </time>
              </div>
              <span>{toast.message}</span>
              <div className="toast-meta">
                <small>{toast.persistent ? "实时消息" : "本地反馈 · 10秒后自动关闭"}</small>
                {toast.actionHref ? (
                  <a className="toast-link" href={toast.actionHref}>
                    {toast.actionLabel ?? "查看"}
                  </a>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="关闭通知"
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== toast.id))}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
