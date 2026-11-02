import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { SUPPORT_TYPE_LABELS, type SupportTicketType } from "../../../../entities/support";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { NewTicketForm } from "../../../support";
import { sellerPaths, useSellerShop } from "../../shared";
import styles from "./ShopSupportTicketPage.module.css";

/** Ce qu'une boutique ouvre en son nom. */
const OPENABLE: readonly SupportTicketType[] = ["customer_report", "general_question", "sanction_appeal"];

const isOpenable = (value: string | null): value is SupportTicketType => value !== null && (OPENABLE as readonly string[]).includes(value);

// ─────────────────────────────────────────────
//  Nouvelle demande de la boutique — /ma-boutique/:boutiqueId/support/nouvelle
//  Signaler un client (depuis sa commande), contester une mesure, ou poser
//  une question à l'équipe de la plateforme.
// ─────────────────────────────────────────────
export const ShopNewTicketPage = () => {
  const { shop, refreshSupportCounts } = useSellerShop();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get("type");
  const type = isOpenable(raw) ? raw : "general_question";
  const targetId = params.get("cible") ?? undefined;
  const targetLabel = params.get("libelle") ?? undefined;

  useDocumentTitle(`${SUPPORT_TYPE_LABELS[type]} — ${shop.nom}`);

  const back = (
    <Link className={styles.back} to={sellerPaths.support(shop.id)}>
      ← Support
    </Link>
  );

  if (type !== "general_question" && !targetId) {
    return (
      <div className={styles.page}>
        {back}
        <Alert tone="info">
          {type === "customer_report"
            ? "Un client se signale depuis sa commande : ouvrez-la et choisissez « Signaler ce client »."
            : "Choisissez « Contester » sous la mesure concernée."}
        </Alert>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {back}
      <NewTicketForm
        type={type}
        targetId={targetId}
        targetLabel={targetLabel}
        shopId={shop.id}
        onCreated={(ticket) => {
          refreshSupportCounts();
          navigate(sellerPaths.supportTicket(shop.id, ticket.id), {
            replace: true,
            state: { feedback: `Demande ${ticket.number} envoyée à l'équipe de la plateforme.` },
          });
        }}
      />
    </div>
  );
};
