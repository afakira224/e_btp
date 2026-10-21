import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { EMPTY_CART, type Cart } from "../../../../entities/cart";
import { useAuth } from "../../../auth";
import {
  addCartItem,
  clearCart as clearCartRequest,
  fetchCart,
  removeCartItem,
  updateCartItem,
} from "../api/cart.api";
import { CartContext } from "./CartContext";

// ─────────────────────────────────────────────
//  CartProvider
//
//  Le panier est une ressource serveur, rattachée à un utilisateur : il n'y
//  a pas de panier anonyme côté back, et on n'en fabrique pas un local qui
//  serait perdu — ou en conflit — à la connexion.
//
//  Chaque écriture renvoie le panier complet, donc l'état local est
//  simplement remplacé : rien à recalculer, rien à resynchroniser.
// ─────────────────────────────────────────────
export const CartProvider = ({ children }: { children: ReactNode }) => {
  const { user, status } = useAuth();
  const userId = user?._id ?? "";

  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      // Déconnexion : la ressource appartenait à l'utilisateur précédent,
      // elle ne doit pas rester à l'écran.
      // oxlint-disable-next-line react/set-state-in-effect
      setCart(EMPTY_CART);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    // oxlint-disable-next-line react/set-state-in-effect
    void (async () => {
      try {
        const chargé = await fetchCart(userId, controller.signal);
        if (!controller.signal.aborted) setCart(chargé);
      } catch {
        // Panier illisible : on reste sur un panier vide plutôt que
        // d'afficher un compteur inventé.
        if (!controller.signal.aborted) setCart(EMPTY_CART);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [userId]);

  // Les erreurs remontent volontairement : l'appelant doit pouvoir afficher
  // « stock insuffisant » plutôt qu'échouer en silence.
  const add = useCallback(
    async (productBoutiqueId: string, quantity = 1) => {
      setCart(await addCartItem(userId, productBoutiqueId, quantity));
    },
    [userId]
  );

  const setQuantity = useCallback(
    async (productBoutiqueId: string, quantity: number) => {
      setCart(await updateCartItem(userId, productBoutiqueId, quantity));
    },
    [userId]
  );

  const remove = useCallback(
    async (productBoutiqueId: string) => {
      setCart(await removeCartItem(userId, productBoutiqueId));
    },
    [userId]
  );

  const clear = useCallback(async () => {
    setCart(await clearCartRequest(userId));
  }, [userId]);

  const value = useMemo(
    () => ({
      cart,
      count: cart.totalItems,
      isLoading: isLoading || status === "pending",
      add,
      setQuantity,
      remove,
      clear,
    }),
    [cart, isLoading, status, add, setQuantity, remove, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
