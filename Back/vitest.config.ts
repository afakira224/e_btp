import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // Alias utilisé par les tests pour cibler les modules à mocker
      // (Vitest résout l'alias : le chemin final est le même que celui
      //  importé par les contrôleurs, donc le mock s'applique bien).
      "@src": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/db/**",
        "src/routers/**",
        "src/models/**",
        "src/shared/swagger/**",
        "src/shared/logger/**",
        "src/shared/mail/**",
      ],
    },
  },
});
