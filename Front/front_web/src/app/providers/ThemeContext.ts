import { createContext } from "react";

export type Theme = "light" | "dark";

export interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

// Contexte et hook isolés du provider : un fichier qui exporte un composant
// ne doit exporter que des composants pour que le Fast Refresh fonctionne.
export const ThemeContext = createContext<ThemeContextValue | null>(null);
