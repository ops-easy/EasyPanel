import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import fs from "fs";
import AutoImport from "unplugin-auto-import/vite";
import checker from "vite-plugin-checker";
import * as lucideIcons from "lucide-react";

const allLucideExports = Object.keys(lucideIcons).filter((key) => key !== "default");

function getUsedLucideIcons() {
  const usedIcons = new Set<string>();
  const srcPath = path.resolve(__dirname, "./src");

  function scanDirectory(dir: string) {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        scanDirectory(filePath);
      } else if (/\.(tsx?|jsx?)$/.test(file)) {
        const content = fs.readFileSync(filePath, "utf-8");

        for (const icon of allLucideExports) {
          const patterns = [
            new RegExp(`<${icon}[\\s/>]`, "g"),
            new RegExp(`[{\\s,=:]${icon}[\\s,})]`, "g"),
          ];

          if (patterns.some((pattern) => pattern.test(content))) {
            usedIcons.add(icon);
          }
        }
      }
    }
  }

  scanDirectory(srcPath);
  return Array.from(usedIcons);
}

const usedLucideIcons = getUsedLucideIcons();

function vendorChunkName(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, "/");

  if (
    normalizedId.includes("/src/lib/utils.ts") ||
    normalizedId.includes("node_modules/clsx") ||
    normalizedId.includes("node_modules/tailwind-merge")
  ) {
    return "ui-utils";
  }
  if (normalizedId.includes("/src/shared/ui/chart.tsx")) return "chart-ui";
  if (normalizedId.includes("node_modules/elkjs")) return "elkjs";
  if (normalizedId.includes("node_modules/cytoscape")) return "cytoscape";
  if (normalizedId.includes("node_modules/highlight.js/lib")) return "highlight-limited";
  if (
    normalizedId.includes("node_modules/@uiw/react-codemirror") ||
    normalizedId.includes("node_modules/@codemirror/") ||
    normalizedId.includes("node_modules/codemirror") ||
    normalizedId.includes("node_modules/@lezer/")
  ) {
    return "codemirror";
  }
  if (normalizedId.includes("node_modules/react-dom/") || normalizedId.includes("node_modules/react/")) {
    return "react-vendor";
  }
  if (normalizedId.includes("node_modules/react-router")) return "router";
  if (normalizedId.includes("node_modules/@tanstack/react-query")) return "react-query";
  if (normalizedId.includes("node_modules/@babel/runtime")) return "babel-runtime";
  if (normalizedId.includes("node_modules/recharts")) return "recharts";
  if (normalizedId.includes("node_modules/@xterm/")) return "xterm";
  return undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_API_TARGET || "http://127.0.0.1:8080";
  const uiBuildVersion = (env.VITE_UI_BUILD_VERSION || "").trim() || "dev";

  return {
    define: {
      __EASYPANEL_UI_BUILD_VERSION__: JSON.stringify(uiBuildVersion),
    },
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
        "^/r(?:/|$)": { target: apiTarget, changeOrigin: true },
        "^/d(?:/|$)": { target: apiTarget, changeOrigin: true },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      AutoImport({
        dts: "src/generated/auto-imports.d.ts",
        include: [/\.[tj]sx?$/],
        ignore: ["Activity"],
        imports: [
          "react",
          {
            "lucide-react": usedLucideIcons,
          },
        ],
        eslintrc: {
          enabled: false,
        },
      }),
      checker({
        typescript: {
          tsconfigPath: "tsconfig.app.json",
        },
        enableBuild: true,
      }),
    ],
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        output: {
          manualChunks: vendorChunkName,
        },
      },
    },
  };
});
