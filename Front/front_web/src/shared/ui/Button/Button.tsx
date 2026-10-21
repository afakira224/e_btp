import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "../Spinner";
import styles from "./Button.module.css";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
  isLoading?: boolean;
  children: ReactNode;
}

export const Button = ({
  variant = "primary",
  fullWidth = false,
  isLoading = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) => (
  <button
    className={[
      styles.button,
      styles[variant],
      fullWidth ? styles.fullWidth : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ")}
    // Un bouton en cours d'envoi reste focusable mais refuse les clics :
    // c'est ce qui évite la double soumission.
    disabled={disabled === true || isLoading}
    aria-busy={isLoading}
    {...rest}
  >
    {isLoading ? <Spinner /> : null}
    {children}
  </button>
);
