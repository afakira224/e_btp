import { splitMatch } from "../utils/text";
import styles from "./Highlight.module.css";

/**
 * Met en valeur la partie du libellé qui correspond à la saisie. Le reste
 * est atténué plutôt que la correspondance colorée : la palette est
 * monochrome, c'est le poids qui porte l'information.
 */
export const Highlight = ({ text, query }: { text: string; query: string }) => {
  const parts = splitMatch(text, query);
  if (!parts) return <>{text}</>;

  return (
    <>
      {parts.before}
      <mark className={styles.mark}>{parts.match}</mark>
      {parts.after}
    </>
  );
};
