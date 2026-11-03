import { useCallback, useState } from "react";
import type { ProductBoutique } from "../../../../entities/product";
import { CAMPAIGN_STATE_LABELS, type Campaign } from "../../../../entities/promotion";
import { ApiError } from "../../../../shared/api";
import { Alert, Button, Input } from "../../../../shared/ui";
import { AccountPanel } from "../../../account";
import { useResource } from "../../../catalog";
import { fetchOpenCampaigns, joinCampaign } from "../api/marketing.api";
import { OfferPicker } from "./OfferPicker";
import styles from "./Marketing.module.css";

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

// ─────────────────────────────────────────────
//  Campagnes de la plateforme (« Rentrée chantier »…) : la boutique y
//  inscrit des offres avec au moins la remise demandée. L'inscription crée
//  une remise produit à ses dates, lancée tout de suite, sans validation.
// ─────────────────────────────────────────────
export const CampaignPanel = ({ shopId, offers, onJoined }: { shopId: string; offers: readonly ProductBoutique[]; onJoined: (message: string) => void }) => {
  const load = useCallback((signal: AbortSignal) => fetchOpenCampaigns(signal), []);
  const campaigns = useResource<Campaign[]>(load, [], "campaigns");
  const [open, setOpen] = useState<string | null>(null);

  if (campaigns.isLoading || campaigns.data.length === 0) return null;

  return (
    <AccountPanel title="Campagnes de la plateforme" description="Inscrivez des offres : elles apparaissent sur la page de la campagne, mise en avant par la plateforme.">
      <ul className={styles.list}>
        {campaigns.data.map((campaign) => (
          <li key={campaign.id} className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <span className={styles.eyebrow}>{CAMPAIGN_STATE_LABELS[campaign.state]}</span>
                <h3 className={styles.cardTitle}>{campaign.nom}</h3>
              </div>
              {open === campaign.id ? null : (
                <Button variant="secondary" onClick={() => setOpen(campaign.id)}>
                  Inscrire des offres
                </Button>
              )}
            </div>
            <ul className={styles.meta}>
              <li>{`Du ${dayFormat.format(new Date(campaign.startDate))} au ${dayFormat.format(new Date(campaign.endDate))}`}</li>
              <li>{`Remise minimale : ${campaign.minDiscount} %`}</li>
              {campaign.offerCount ? <li>{`${campaign.offerCount} offre${campaign.offerCount > 1 ? "s" : ""} inscrite${campaign.offerCount > 1 ? "s" : ""}`}</li> : null}
            </ul>
            {campaign.description ? <p className={styles.hint}>{campaign.description}</p> : null}
            {open === campaign.id ? (
              <JoinForm
                campaign={campaign}
                shopId={shopId}
                offers={offers}
                onCancel={() => setOpen(null)}
                onJoined={(message) => {
                  setOpen(null);
                  onJoined(message);
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </AccountPanel>
  );
};

const JoinForm = ({
  campaign,
  shopId,
  offers,
  onCancel,
  onJoined,
}: {
  campaign: Campaign;
  shopId: string;
  offers: readonly ProductBoutique[];
  onCancel: () => void;
  onJoined: (message: string) => void;
}) => {
  const eligible = campaign.familleIds.length > 0 ? offers.filter((offer) => campaign.familleIds.includes(offer.product?.familles[0]?.id ?? "")) : offers;
  const [ids, setIds] = useState<string[]>([]);
  const [discount, setDiscount] = useState(String(campaign.minDiscount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = Number(discount);
  const high = value > 50;

  const submit = async () => {
    if (high && !window.confirm(`Une remise de ${value} % est très forte. La confirmer ?`)) return;
    setBusy(true);
    setError(null);
    try {
      const { message } = await joinCampaign(campaign.id, { boutiqueId: shopId, productBoutiqueIds: ids, discountValue: value, confirmHighDiscount: high });
      onJoined(message);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "L'inscription a échoué.");
      setBusy(false);
    }
  };

  return (
    <div className={styles.form}>
      <OfferPicker offers={eligible} value={ids} onChange={setIds} max={50} label="Offres à inscrire" />
      <Input
        label="Remise (%)"
        type="number"
        min={campaign.minDiscount}
        max={70}
        value={discount}
        onChange={(event) => setDiscount(event.target.value)}
        hint={`${campaign.minDiscount} % au moins, 70 % au plus.`}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className={styles.actions}>
        <Button onClick={() => void submit()} isLoading={busy} disabled={ids.length === 0 || !(value >= campaign.minDiscount)}>
          Inscrire {ids.length > 0 ? `${ids.length} offre${ids.length > 1 ? "s" : ""}` : ""}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
      </div>
    </div>
  );
};
