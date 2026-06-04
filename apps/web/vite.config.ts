import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  const appEnv = loadEnv(mode, process.cwd(), "");
  const env = { ...rootEnv, ...appEnv };
  const apiPort = env.API_PORT ?? "4100";
  const webPort = Number(env.WEB_PORT ?? 5174);
  const apiTarget = env.API_PROXY_TARGET ?? `http://localhost:${apiPort}`;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@oem-crm/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts")
      }
    },
    server: {
      port: webPort,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true
        }
      }
    }
  };
});
