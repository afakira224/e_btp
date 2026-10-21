import type { ReactNode } from "react";
import styles from "./Badge.module.css";

interface BadgeProps {
  tone?: "neutral" | "accent" | "solid" | "muted";
  children: ReactNode;
}

export const Badge = ({ tone = "neutral", children }: BadgeProps) => (
  <span className={[styles.badge, styles[tone]].join(" ")}>{children}</span>
);
