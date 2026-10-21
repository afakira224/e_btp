import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { EMPTY_WISHLIST, type Wishlist } from "../../../../entities/wishlist";
import { useAuth } from "../../../auth";
import {
  addWishlistItem,
  clearWishlist as clearWishlistRequest,
  fetchWishlist,
  removeWishlistItem,
} from "../api/wishlist.api";
import { WishlistContext } from "./WishlistContext";

// ─────────────────────────────────────────────
//  WishlistProvider
//
//  Même principe que le panier : ressource serveur rattachée à un
//  utilisateur, aucun favori anonyme. Chaque écriture renvoie la liste
//  complète, l'état local est remplacé.
// ─────────────────────────────────────────────
export const WishlistProvider = ({ children }: { children: ReactNode }) => {
  const { user, status } = useAuth();
  const userId = user?._id ?? "";

  const [wishlist, setWishlist] = useState<Wishlist>(EMPTY_WISHLIST);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      // Déconnexion : la ressource appartenait à l'utilisateur précédent,
      // elle ne doit pas rester à l'écran.
      // oxlint-disable-next-line react/set-state-in-effect
      setWishlist(EMPTY_WISHLIST);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);

    // oxlint-disable-next-line react/set-state-in-effect
    void (async () => {
      try {
        const chargée = await fetchWishlist(userId, controller.signal);
        if (!controller.signal.aborted) setWishlist(chargée);
      } catch {
        if (!controller.signal.aborted) setWishlist(EMPTY_WISHLIST);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [userId]);

  const has = useCallback(
    (productBoutiqueId: string) =>
      wishlist.items.some((item) => item.productBoutiqueId === productBoutiqueId),
    [wishlist]
  );

  const remove = useCallback(
    async (productBoutiqueId: string) => {
      setWishlist(await removeWishlistItem(userId, productBoutiqueId));
    },
    [userId]
  );

  const toggle = useCallback(
    async (productBoutiqueId: string) => {
      // L'ajout étant idempotent côté back, seule la suppression a besoin
      // qu'on sache où on en est.
      if (has(productBoutiqueId)) {
        await remove(productBoutiqueId);
        return;
      }
      setWishlist(await addWishlistItem(userId, productBoutiqueId));
    },
    [has, remove, userId]
  );

  const clear = useCallback(async () => {
    setWishlist(await clearWishlistRequest(userId));
  }, [userId]);

  const value = useMemo(
    () => ({
      wishlist,
      count: wishlist.totalItems,
      isLoading: isLoading || status === "pending",
      has,
      toggle,
      remove,
      clear,
    }),
    [wishlist, isLoading, status, has, toggle, remove, clear]
  );

  return (
    <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
  );
};
