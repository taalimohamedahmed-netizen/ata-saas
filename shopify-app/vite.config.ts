import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig, type UserConfig } from "vite";

export default defineConfig({
  server: {
    port: Number(process.env.PORT || 3000),
    hmr: process.env.SHOPIFY_CLI_ENV ? false : true,
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
    }),
  ],
  resolve: {
    alias: {
      "~": new URL("./app", import.meta.url).pathname,
    },
  },
  build: {
    assetsInlineLimit: 0,
  },
}) satisfies UserConfig;
