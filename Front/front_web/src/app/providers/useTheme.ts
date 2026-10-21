import { useContext } from "react";
import { ThemeContext, type ThemeContextValue } from "./ThemeContext";

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme doit être utilisé dans un ThemeProvider.");
  return context;
};
