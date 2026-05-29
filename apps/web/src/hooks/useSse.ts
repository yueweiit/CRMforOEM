import { useEffect, useRef } from "react";

type SseEventHandler = (data: any) => void;

let globalSource: EventSource | null = null;
let sourceVersion = 0;

function getEventSource(): EventSource | null {
  const token = localStorage.getItem("accessToken");
  if (!token) return null;

  if (!globalSource || globalSource.readyState === EventSource.CLOSED) {
    const url = `/api/events?token=${encodeURIComponent(token)}`;
    globalSource = new EventSource(url);
    sourceVersion++;
  }

  return globalSource;
}

export function closeSse() {
  globalSource?.close();
  globalSource = null;
}

export function useSse(event: string, handler: SseEventHandler, deps: unknown[] = []) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onEvent = (e: MessageEvent) => {
      try {
        handlerRef.current(JSON.parse(e.data));
      } catch {
        handlerRef.current(e.data);
      }
    };

    const source = getEventSource();
    if (source) {
      source.addEventListener(event, onEvent);
    }

    return () => {
      if (source) {
        source.removeEventListener(event, onEvent);
      }
    };
  }, [event, sourceVersion, ...deps]);
}
