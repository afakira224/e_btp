import type { ReactNode } from "react";
import { AuthProvider } from "../../features/auth";
import { CartProvider } from "../../features/cart";
import { WishlistProvider } from "../../features/wishlist";
import { ThemeProvider } from "./ThemeProvider";

// Le thème enveloppe l'auth : les écrans d'attente de session doivent déjà
// s'afficher avec les bonnes couleurs.
export const AppProviders = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>{children}</WishlistProvider>
      </CartProvider>
    </AuthProvider>
  </ThemeProvider>
);
