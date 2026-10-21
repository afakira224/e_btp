import type { Shop } from "../../../../entities/shop";
import { assetUrl } from "../../../../shared/config/env";
import styles from "./ShopAvatar.module.css";

/** Deux initiales : « Dépôt Matam » → « DM », « Volta Électrique » → « VÉ ». */
const initials = (nom: string): string =>
  nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

/**
 * Logo de la boutique, ou son monogramme quand elle n'en a pas envoyé.
 * Le monogramme reste dans la palette : pas de couleur tirée au hasard.
 */
export const ShopAvatar = ({
  shop,
  size = "md",
}: {
  shop: Pick<Shop, "nom" | "logo">;
  size?: "md" | "lg";
}) => (
  <span className={[styles.avatar, styles[size]].join(" ")} aria-hidden="true">
    {shop.logo ? (
      <img className={styles.image} src={assetUrl(shop.logo)} alt="" loading="lazy" />
    ) : (
      initials(shop.nom)
    )}
  </span>
);
