import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, "../.."), "");
  const apiPort = env.PORT || env.API_PORT || "3000";

  return {
    plugins: [vue()],
    publicDir: "public",
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
          timeout: 600_000,
        },
        "/health": {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
