import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Le back BTP (npm run dev dans Back/). Le proxy fait passer l'API et ses
  // fichiers par l'origine du front : pas de CORS, cookie de session
  // first-party, et les chemins « /uploads/… » s'affichent tels quels.
  const back = env.VITE_BACK_URL ?? "http://localhost:5000";

  return {
    plugins: [react()],
    server: {
      // Port figé : 5173 est déjà pris par le projet Wolikhai Support sur cette
      // machine. Sans `strictPort`, Vite glisserait silencieusement sur 5174,
      // 5175… et l'URL changerait à chaque démarrage.
      port: 5174,
      strictPort: true,
      proxy: {
        "/api": { target: back, changeOrigin: true },
        "/uploads": { target: back, changeOrigin: true },
      },
    },
  };
});
