import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// TanStack Start renders the page on the server; Nitro builds that server.
// With no preset it targets plain Node (`.output/`); set NITRO_PRESET
// (vercel, netlify, cloudflare_module, …) to target a host. The site reads
// only the data committed in this repository and calls no data service.
// See docs/ARCHITECTURE.md § Despliegue.
export default defineConfig(({ command, isPreview }) => ({
  server: { port: 8080 },
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview ? [nitro()] : []),
    viteReact(),
  ],
}));
