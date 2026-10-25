import {
  CATALOG_SIZE_LABELS,
  SELLER_EXPERIENCE_LABELS,
  SELLER_TYPE_LABELS,
  SellerType,
  type ShopRequest,
} from "../../../../entities/shop-request";
import styles from "./ShopRequestSummary.module.css";

/**
 * Les réponses du questionnaire, telles que déposées. Partagé par le suivi
 * du demandeur et l'examen de l'administration : les deux lisent la même
 * chose, dans le même ordre que le formulaire.
 */
export const ShopRequestSummary = ({ request }: { request: ShopRequest }) => {
  const domaines = request.familles.map((famille) => famille.nom ?? famille.id).join(", ");

  const facts: { term: string; value: string }[] = [
    { term: "Boutique", value: request.nom },
    { term: "Présentation", value: request.description },
    { term: "Domaines", value: domaines || "—" },
    {
      term: "Statut",
      value:
        request.sellerType === SellerType.ENTREPRISE && request.rccm
          ? `${SELLER_TYPE_LABELS[request.sellerType]} · RCCM ${request.rccm}`
          : SELLER_TYPE_LABELS[request.sellerType],
    },
    { term: "Ancienneté", value: SELLER_EXPERIENCE_LABELS[request.experience] },
    { term: "Catalogue prévu", value: CATALOG_SIZE_LABELS[request.catalogSize] },
    { term: "Point de vente", value: request.hasPhysicalStore ? "Oui, ouvert aux clients" : "Non" },
    { term: "Adresse", value: request.adresse },
    { term: "Email de contact", value: request.email ?? "Celui du compte" },
  ];
  if (request.message) facts.push({ term: "Message", value: request.message });

  return (
    <dl className={styles.facts}>
      {facts.map((fact) => (
        <div key={fact.term} className={styles.fact}>
          <dt>{fact.term}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
};
