import { Link } from "react-router-dom";
import type { ShopDeliveryOverview } from "../../../../entities/delivery";
import type { Shop } from "../../../../entities/shop";
import {
  DeliveryModesEditor,
  DeliverySummary,
  sellerPaths,
  type DeliveryDraft,
} from "../../shared";
import styles from "./OfferDeliverySection.module.css";

interface OfferDeliverySectionProps {
  shop: Shop;
  /** Réglages actuels de la boutique : ce dont le produit hérite. */
  shopDelivery: ShopDeliveryOverview | null;
  useShopSettings: boolean;
  onUseShopSettings: (value: boolean) => void;
  draft: DeliveryDraft;
  onDraftChange: (next: DeliveryDraft) => void;
  onBlur: (field: keyof DeliveryDraft) => void;
  errors: Partial<Record<keyof DeliveryDraft, string | undefined>>;
  /** Le produit avait une livraison propre : la quitter l'abandonne. */
  wasCustom: boolean;
  disabled?: boolean;
}

// ─────────────────────────────────────────────
//  Modes de livraison d'un produit.
//  Par défaut il suit la boutique : rien à ressaisir, et il suivra ses
//  modifications futures. Personnaliser lui donne ses propres règles, que la
//  boutique n'écrasera plus ; revenir aux paramètres de la boutique reprend
//  aussitôt ses réglages actuels.
// ─────────────────────────────────────────────
export const OfferDeliverySection = ({
  shop,
  shopDelivery,
  useShopSettings,
  onUseShopSettings,
  draft,
  onDraftChange,
  onBlur,
  errors,
  wasCustom,
  disabled = false,
}: OfferDeliverySectionProps) => (
  <fieldset className={styles.section}>
    <legend className={styles.legend}>Modes de livraison</legend>

    <div className={styles.choices}>
      <label className={styles.choice}>
        <input
          type="radio"
          name="deliverySource"
          checked={useShopSettings}
          disabled={disabled}
          onChange={() => onUseShopSettings(true)}
        />
        <span className={styles.choiceText}>
          <span className={styles.choiceTitle}>Utiliser les paramètres de la boutique</span>
          <span className={styles.choiceHint}>
            Le produit suit les réglages de {shop.nom}, y compris leurs modifications futures.
          </span>
        </span>
      </label>

      <label className={styles.choice}>
        <input
          type="radio"
          name="deliverySource"
          checked={!useShopSettings}
          disabled={disabled}
          onChange={() => onUseShopSettings(false)}
        />
        <span className={styles.choiceText}>
          <span className={styles.choiceTitle}>Personnaliser la livraison de ce produit</span>
          <span className={styles.choiceHint}>
            D'autres modes ou un autre tarif, que les réglages de la boutique ne modifieront pas.
          </span>
        </span>
      </label>
    </div>

    {useShopSettings ? (
      <div className={styles.inherited}>
        <p className={styles.origin}>
          <span className={styles.originTag}>Hérité</span>
          Paramètres de la boutique {shop.nom}
        </p>
        {shopDelivery ? (
          <DeliverySummary options={shopDelivery.options} />
        ) : (
          <p className={styles.muted}>Chargement des réglages de la boutique…</p>
        )}
        <p className={styles.muted}>
          En lecture seule ici.{" "}
          <Link to={sellerPaths.delivery(shop.id)}>Modifier les paramètres de la boutique</Link>
        </p>
        {wasCustom ? (
          <p className={styles.warning} role="status">
            À l'enregistrement, la livraison personnalisée de ce produit sera abandonnée : il
            suivra immédiatement les paramètres actuels de la boutique.
          </p>
        ) : null}
      </div>
    ) : (
      <div className={styles.custom}>
        <DeliveryModesEditor
          legend="Modes proposés pour ce produit"
          value={draft}
          onChange={onDraftChange}
          onBlur={onBlur}
          errors={errors}
          shopAddress={shop.adresse}
          disabled={disabled}
        />
        <p className={styles.muted}>
          Les modes non cochés ne seront pas proposés au client pour ce produit.
        </p>
      </div>
    )}
  </fieldset>
);
