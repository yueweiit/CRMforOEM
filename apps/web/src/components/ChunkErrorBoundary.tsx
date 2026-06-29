import { Component, type ErrorInfo, type ReactNode } from "react";

type ChunkErrorBoundaryProps = {
  children: ReactNode;
  resetKey?: string;
};

type ChunkErrorBoundaryState = {
  chunkError: Error | null;
};

type VitePreloadErrorEvent = Event & {
  payload?: unknown;
};

const CHUNK_ERROR_PATTERNS = [
  "ChunkLoadError",
  "Loading chunk",
  "Loading CSS chunk",
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "vite:preloaderror",
  "preload failed",
  "Unable to preload CSS"
];

export function isChunkLoadError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  const type = typeof error === "object" && error && "type" in error ? String(error.type) : "";
  const text = `${name} ${message}`;

  return CHUNK_ERROR_PATTERNS.some((pattern) => `${type} ${text}`.toLowerCase().includes(pattern.toLowerCase()));
}

export class ChunkErrorBoundary extends Component<ChunkErrorBoundaryProps, ChunkErrorBoundaryState> {
  state: ChunkErrorBoundaryState = {
    chunkError: null
  };

  private handlePreloadError = (event: Event) => {
    const payload = (event as VitePreloadErrorEvent).payload ?? event;

    if (!isChunkLoadError(payload) && !isChunkLoadError(event)) return;

    event.preventDefault();
    const error = payload instanceof Error ? payload : new Error("页面资源加载失败");
    console.warn("[ChunkErrorBoundary] vite:preloadError caught:", error);
    this.setState({ chunkError: error });
  };

  static getDerivedStateFromError(error: unknown): ChunkErrorBoundaryState {
    if (!isChunkLoadError(error)) {
      throw error;
    }

    return { chunkError: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidMount() {
    window.addEventListener("vite:preloadError", this.handlePreloadError);
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (!isChunkLoadError(error)) return;

    console.error("[ChunkErrorBoundary] chunk load failed:", error, errorInfo);
  }

  componentDidUpdate(prevProps: ChunkErrorBoundaryProps) {
    if (this.state.chunkError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ chunkError: null });
    }
  }

  componentWillUnmount() {
    window.removeEventListener("vite:preloadError", this.handlePreloadError);
  }

  render() {
    if (!this.state.chunkError) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        style={{
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          padding: 24,
          background: "#f6f7f4",
          color: "#1f2933"
        }}
      >
        <div
          style={{
            width: "min(420px, 100%)",
            border: "1px solid #dfe3dc",
            borderRadius: 8,
            background: "white",
            padding: 24,
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.08)"
          }}
        >
          <h1 style={{ margin: "0 0 10px", fontSize: 20, lineHeight: 1.3 }}>页面资源已更新</h1>
          <p style={{ margin: "0 0 18px", color: "#52616b", lineHeight: 1.6 }}>
            当前页面加载的资源版本已失效，请刷新页面后继续使用。
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            autoFocus
            style={{
              minHeight: 38,
              border: 0,
              borderRadius: 7,
              background: "#0f766e",
              color: "white",
              cursor: "pointer",
              font: "inherit",
              fontWeight: 700,
              padding: "0 14px"
            }}
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }
}
