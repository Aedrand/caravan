import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // API + WS go to the Hono server in dev; in prod the server serves the SPA itself
      "/api": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
});
