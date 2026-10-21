import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export const Card = ({ children, className, ...rest }: CardProps) => (
  <div className={[styles.card, className ?? ""].filter(Boolean).join(" ")} {...rest}>
    {children}
  </div>
);
