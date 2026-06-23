import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");

function normalizeBasePath(value: string | undefined) {
  const raw = (value ?? "/").trim();
  if (!raw || raw === "/") return "/";
  return `/${raw.replace(/^\/+|\/+$/g, "")}/`;
}

function parseAllowedHosts(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, workspaceRoot, "");
  const appEnv = loadEnv(mode, process.cwd(), "");
  const env = { ...rootEnv, ...appEnv };
  const apiPort = env.API_PORT ?? "4100";
  const webPort = Number(env.WEB_PORT ?? 5174);
  const apiTarget = env.API_PROXY_TARGET ?? `http://localhost:${apiPort}`;
  const allowedHosts = parseAllowedHosts(env.VITE_ALLOWED_HOSTS);
  const basePath = normalizeBasePath(env.VITE_BASE_PATH);
  const apiProxyPath = `${basePath.replace(/\/$/, "")}/api`;
  const proxy: Record<string, { target: string; changeOrigin: boolean; rewrite?: (requestPath: string) => string }> = {
    "/api": {
      target: apiTarget,
      changeOrigin: true
    }
  };

  if (apiProxyPath !== "/api") {
    proxy[apiProxyPath] = {
      target: apiTarget,
      changeOrigin: true,
      rewrite: (requestPath: string) => requestPath.replace(new RegExp(`^${apiProxyPath}`), "/api")
    };
  }

  return {
    root: __dirname,
    envDir: workspaceRoot,
    plugins: [react()],
    base: basePath,
    resolve: {
      alias: {
        "@oem-crm/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts")
      }
    },
    server: {
      port: webPort,
      strictPort: true,
      allowedHosts: allowedHosts.length ? allowedHosts : ["lemos-case.com", "www.lemos-case.com"],
      proxy
    }
  };
});
