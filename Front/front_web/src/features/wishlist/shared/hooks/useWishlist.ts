import { useContext } from "react";
import {
  WishlistContext,
  type WishlistContextValue,
} from "../context/WishlistContext";

export const useWishlist = (): WishlistContextValue => {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist doit être utilisé dans un WishlistProvider.");
  return context;
};
