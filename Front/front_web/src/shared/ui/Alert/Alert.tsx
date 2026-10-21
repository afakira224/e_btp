import type { ReactNode } from "react";
import styles from "./Alert.module.css";

type Tone = "danger" | "success" | "warning" | "info";

interface AlertProps {
  tone?: Tone;
  children: ReactNode;
}

const ICONS: Record<Tone, string> = {
  danger: "!",
  success: "✓",
  warning: "!",
  info: "i",
};

export const Alert = ({ tone = "info", children }: AlertProps) => (
  <div
    className={[styles.alert, styles[tone]].join(" ")}
    // Une erreur interrompt la lecture, le reste est annoncé poliment.
    role={tone === "danger" ? "alert" : "status"}
  >
    <span className={styles.icon} aria-hidden="true">
      {ICONS[tone]}
    </span>
    <div className={styles.content}>{children}</div>
  </div>
);
