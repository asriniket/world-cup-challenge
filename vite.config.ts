import { defineConfig, loadEnv, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";

function installApiRoute(server: ViteDevServer, path: string, modulePath: string) {
  server.middlewares.use(path, async (_request, response) => {
    try {
      const module = await server.ssrLoadModule(modulePath);
      const result = (await module.default()) as Response;
      response.statusCode = result.status;
      result.headers.forEach((value, key) => response.setHeader(key, value));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch (error) {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        warning: error instanceof Error ? error.message : "Local API route failed",
      }));
    }
  });
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [
      react(),
      {
        name: "local-api-routes",
        configureServer(server) {
          installApiRoute(server, "/api/live-state", "/api/live-state.ts");
          installApiRoute(server, "/api/market-odds", "/api/market-odds.ts");
          installApiRoute(server, "/api/draw", "/api/draw.ts");
        },
      },
    ],
  };
});
