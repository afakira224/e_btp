import { useState } from "react";
import { productName, type ProductBoutique } from "../../../../entities/product";
import { ApiError } from "../../../../shared/api";
import { Alert, Button, Select, Thumbnail } from "../../../../shared/ui";
import { AccountPanel } from "../../../account";
import { setFeaturedRank } from "../api/marketing.api";
import styles from "./Marketing.module.css";

const MAX = 6;

// ─────────────────────────────────────────────
//  Produits phares : jusqu'à 6 produits en tête de la vitrine, dans l'ordre
//  choisi. Gratuit, sans limite de durée.
// ─────────────────────────────────────────────
export const FeaturedPanel = ({
  featured,
  offers,
  onChanged,
  storefront,
}: {
  featured: readonly ProductBoutique[];
  offers: readonly ProductBoutique[];
  onChanged: (message: string) => void;
  storefront: string;
}) => {
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = featured.map((offer) => offer.id);
  const candidates = offers.filter((offer) => !ids.includes(offer.id) && !offer.hidden);

  const run = async (offerId: string, rank: number | null) => {
    setBusy(offerId);
    setError(null);
    try {
      onChanged(await setFeaturedRank(offerId, rank));
      setAdding("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Modification impossible.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AccountPanel title="Produits phares" description={`Jusqu'à ${MAX} produits en tête de votre vitrine, dans cet ordre. Gratuit.`} more={{ to: storefront, label: "Voir la vitrine" }}>
      {featured.length === 0 ? <p className={styles.hint}>Aucun produit phare : votre vitrine montre vos produits les plus récents.</p> : null}
      <ol className={styles.list}>
        {featured.map((offer, index) => (
          <li key={offer.id} className={styles.pick}>
            <span className={styles.eyebrow}>{index + 1}</span>
            <span className={styles.offerThumb}>
              <Thumbnail src={offer.urlImages[0]} alt="" seed={offer.id} />
            </span>
            <span className={styles.pickName}>{productName(offer)}</span>
            <Button variant="ghost" onClick={() => void run(offer.id, index)} disabled={index === 0 || busy !== null} aria-label={`Monter ${productName(offer)}`}>
              ↑
            </Button>
            <Button variant="ghost" onClick={() => void run(offer.id, index + 2)} disabled={index === featured.length - 1 || busy !== null} aria-label={`Descendre ${productName(offer)}`}>
              ↓
            </Button>
            <Button variant="ghost" onClick={() => void run(offer.id, null)} isLoading={busy === offer.id} disabled={busy !== null}>
              Retirer
            </Button>
          </li>
        ))}
      </ol>
      {featured.length < MAX && candidates.length > 0 ? (
        <div className={styles.actions}>
          <Select
            label="Ajouter un produit phare"
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
            options={[{ value: "", label: "Choisir…" }, ...candidates.map((offer) => ({ value: offer.id, label: productName(offer) }))]}
          />
          <Button onClick={() => void run(adding, featured.length + 1)} disabled={!adding || busy !== null}>
            Ajouter
          </Button>
        </div>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </AccountPanel>
  );
};
