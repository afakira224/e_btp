import { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ShopDeliveryOverview } from "../../../../entities/delivery";
import { productName, type ProductBoutique } from "../../../../entities/product";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountPanel } from "../../../account";
import { useResource } from "../../../catalog";
import {
  createOffer,
  fetchOffer,
  fetchShopDelivery,
  sellerPaths,
  updateOffer,
  useSellerShop,
  type OfferSubmission,
} from "../../shared";
import { OfferForm } from "../components/OfferForm";
import type { OffersPageState } from "./OffersPage";
import styles from "./OfferFormPage.module.css";

// ─────────────────────────────────────────────
//  Ajout et modification d'un produit :
//   • /ma-boutique/:boutiqueId/produits/nouveau
//   • /ma-boutique/:boutiqueId/produits/:offreId/modifier
//  Les réglages de livraison de la boutique sont relus à l'arrivée : ce sont
//  eux que le produit hérite, et ceux qu'il affiche en lecture seule.
// ─────────────────────────────────────────────
export const OfferFormPage = () => {
  const { shop } = useSellerShop();
  const { offreId } = useParams<{ offreId: string }>();
  const navigate = useNavigate();
  const isEdit = offreId !== undefined;

  const loadOffer = useCallback(
    (signal: AbortSignal) => (offreId ? fetchOffer(offreId, signal) : Promise.resolve(null)),
    [offreId]
  );
  const offer = useResource<ProductBoutique | null>(loadOffer, null, offreId ?? "nouveau");

  const loadDelivery = useCallback((signal: AbortSignal) => fetchShopDelivery(shop.id, signal), [shop.id]);
  const shopDelivery = useResource<ShopDeliveryOverview | null>(loadDelivery, null, shop.id);

  const title = isEdit
    ? offer.data
      ? `Modifier « ${productName(offer.data)} »`
      : "Modifier le produit"
    : "Nouveau produit";
  useDocumentTitle(title);

  const backToList = (feedback?: string) =>
    navigate(
      sellerPaths.products(shop.id),
      feedback ? { state: { feedback } satisfies OffersPageState } : undefined
    );

  const submit = async (submission: OfferSubmission, productId: string) => {
    if (offreId) {
      await updateOffer(offreId, submission);
      backToList("Produit mis à jour.");
    } else {
      await createOffer(shop.id, productId, submission);
      backToList("Produit ajouté.");
    }
  };

  const back = (
    <Link className={styles.back} to={sellerPaths.products(shop.id)}>
      ← Produits de la boutique
    </Link>
  );

  if (isEdit && offer.error) {
    return (
      <div className={styles.page}>
        {back}
        <Alert tone="danger">{offer.error}</Alert>
      </div>
    );
  }

  if (isEdit && (offer.isLoading || !offer.data)) {
    return (
      <div className={styles.page}>
        {back}
        <div className={styles.skeleton} aria-hidden="true" />
      </div>
    );
  }

  // Un lien de modification qui viserait le produit d'une autre boutique.
  if (offer.data && offer.data.boutique && offer.data.boutique.id !== shop.id) {
    return (
      <div className={styles.page}>
        {back}
        <Alert tone="danger">Ce produit n'appartient pas à cette boutique.</Alert>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {back}
      {shopDelivery.error ? <Alert tone="warning">{shopDelivery.error}</Alert> : null}
      <AccountPanel
        title={title}
        description={
          isEdit
            ? undefined
            : "Mettez en vente un produit du catalogue : prix, stock, photos et livraison."
        }
      >
        <OfferForm
          // Un produit = un formulaire neuf.
          key={offreId ?? "nouveau"}
          shop={shop}
          shopDelivery={shopDelivery.data}
          offer={offer.data ?? undefined}
          onSubmit={submit}
          onCancel={() => backToList()}
        />
      </AccountPanel>
    </div>
  );
};
