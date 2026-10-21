import { useContext } from "react";
import { CartContext, type CartContextValue } from "../context/CartContext";

export const useCart = (): CartContextValue => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart doit être utilisé dans un CartProvider.");
  return context;
};
