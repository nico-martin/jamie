import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  publicDir: "assets",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      includeAssets: ["favicon.svg", "favicon.png"],
      manifest: {
        name: "Jamie Recipe Assistant",
        short_name: "Jamie",
        description: "An offline AI recipe builder and cooking companion",
        theme_color: "#344c3d",
        background_color: "#f5efe3",
        display: "standalone",
        start_url: ".",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "favicon.png",
            sizes: "1000x1000",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: "index.html",
        globPatterns: ["**/*.{html,js,css,wasm,png,jpg,jpeg,svg,webp,ico}"],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
      },
    }),
  ],
});
