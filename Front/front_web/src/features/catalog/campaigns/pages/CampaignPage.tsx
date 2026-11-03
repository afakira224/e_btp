import { useCallback } from "react";
import { useParams } from "react-router-dom";
import type { ProductBoutique } from "../../../../entities/product";
import { CAMPAIGN_STATE_LABELS, type Campaign } from "../../../../entities/promotion";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { CatalogHeader, CatalogPage, CatalogSkeletons, EmptyState, ProductGrid } from "../../shared/components/CatalogPage";
import { fetchCampaign, useResource } from "../../shared";

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

// ─────────────────────────────────────────────
//  Campagne de la plateforme — /campagnes/:slug
//  Une opération commerciale (« Rentrée chantier ») et toutes les offres que
//  les boutiques y ont inscrites, la plus remisée d'abord.
// ─────────────────────────────────────────────
export const CampaignPage = () => {
  const { slug = "" } = useParams<{ slug: string }>();
  const load = useCallback((signal: AbortSignal) => fetchCampaign(slug, signal), [slug]);
  const campaign = useResource<(Campaign & { offers: ProductBoutique[] }) | null>(load, null, slug);
  const data = campaign.data;
  useDocumentTitle(data?.nom ?? "Campagne");

  const crumbs = [
    { label: "Accueil", to: "/" },
    { label: "Promotions", to: "/promotions" },
    { label: data?.nom ?? "Campagne" },
  ];

  if (campaign.error) {
    return (
      <CatalogPage>
        <CatalogHeader crumbs={crumbs} eyebrow="Campagne" title="Campagne introuvable" />
        <EmptyState title="Cette campagne n'existe pas" text={campaign.error} action={{ to: "/promotions", label: "Voir les promotions" }} />
      </CatalogPage>
    );
  }
  if (campaign.isLoading || !data) {
    return (
      <CatalogPage>
        <CatalogHeader crumbs={crumbs} eyebrow="Campagne" title="…" />
        <CatalogSkeletons count={4} />
      </CatalogPage>
    );
  }

  return (
    <CatalogPage>
      <CatalogHeader
        crumbs={crumbs}
        eyebrow={`Campagne · ${CAMPAIGN_STATE_LABELS[data.state]}`}
        title={data.nom}
        lede={`${data.description ? `${data.description} ` : ""}Du ${dayFormat.format(new Date(data.startDate))} au ${dayFormat.format(new Date(data.endDate))}, au moins −${data.minDiscount} % chez les boutiques participantes.`}
        count={data.offers.length}
      />
      <ProductGrid
        items={data.offers}
        isLoading={false}
        error={null}
        empty={{
          title: data.state === "upcoming" ? "La campagne n'a pas encore commencé" : "Aucune offre pour l'instant",
          text: data.state === "upcoming" ? `Rendez-vous le ${dayFormat.format(new Date(data.startDate))}.` : "Les boutiques y inscrivent leurs offres : revenez bientôt.",
          action: { to: "/promotions", label: "Voir les promotions" },
        }}
      />
    </CatalogPage>
  );
};
