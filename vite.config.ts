import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base =
  process.env.GITHUB_ACTIONS === "true" && repositoryName
    ? `/${repositoryName}/`
    : "/";

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5174,
    // Let Vite fall back to the next available port if 5174 is occupied.
    allowedHosts: ["localhost", "127.0.0.1", ".fly.dev"],
  },
});
