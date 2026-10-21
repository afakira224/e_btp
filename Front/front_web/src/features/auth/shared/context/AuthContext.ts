import { createContext } from "react";
import type { AuthContextValue } from "../types/auth.types";

// Contexte isolé dans son propre fichier : le provider reste le seul
// composant exporté par AuthProvider.tsx (compatible Fast Refresh).
export const AuthContext = createContext<AuthContextValue | null>(null);
