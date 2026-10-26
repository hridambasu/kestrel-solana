import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dashboard imports the shared SDK (../sdk) and deployment file (../deployments).
export default defineConfig({
  plugins: [react()],
  define: { "process.env": {}, global: "globalThis" },
  resolve: {
    alias: { buffer: "buffer/" }, // the npm package, not the Node builtin
    // SDK files live outside app/, make them resolve this app's node_modules.
    dedupe: ["@coral-xyz/anchor", "@solana/web3.js", "@solana/spl-token"],
  },
  server: { fs: { allow: [".."] } },
  optimizeDeps: { include: ["buffer/", "@coral-xyz/anchor", "@solana/web3.js", "@solana/spl-token"] },
});
