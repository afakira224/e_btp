import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { SUPPORT_TYPE_LABELS, type SupportTicketType } from "../../../../entities/support";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { NewTicketForm, supportPaths } from "../../../support";
import { AccountHeader, AccountPage } from "../../shared";

const SUPPORT_CRUMB = { label: "Support", to: "/compte/support" };

/**
 * Ce qu'un client ouvre ici. Un retour se demande depuis la commande livrée,
 * un client se signale depuis l'espace boutique.
 */
const OPENABLE: readonly SupportTicketType[] = ["order_problem", "listing_report", "shop_report", "review_report", "general_question", "sanction_appeal"];
const NEEDS_TARGET: readonly SupportTicketType[] = ["order_problem", "listing_report", "shop_report", "review_report", "sanction_appeal"];

/** D'où partir pour chaque type quand le lien ne dit pas ce qui est visé. */
const WHERE: Partial<Record<SupportTicketType, string>> = {
  order_problem: "Ouvrez la commande concernée et choisissez « Signaler un problème » sous la boutique.",
  listing_report: "Ouvrez l'annonce et choisissez « Signaler cette annonce ».",
  shop_report: "Ouvrez la page de la boutique et choisissez « Signaler cette boutique ».",
  review_report: "Choisissez « Signaler » sous l'avis concerné.",
  sanction_appeal: "Choisissez « Contester » sous la mesure, dans Support.",
};

const isOpenable = (value: string | null): value is SupportTicketType => value !== null && (OPENABLE as readonly string[]).includes(value);

// ─────────────────────────────────────────────
//  Nouvelle demande — /compte/support/nouvelle?type=&cible=&libelle=
//  On y arrive depuis le bouton placé là où le problème se voit : le type et
//  la cible sont dans le lien.
// ─────────────────────────────────────────────
export const NewTicketPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const raw = params.get("type");
  const type = isOpenable(raw) ? raw : "general_question";
  const targetId = params.get("cible") ?? undefined;
  const targetLabel = params.get("libelle") ?? undefined;

  useDocumentTitle(SUPPORT_TYPE_LABELS[type]);

  const missing = NEEDS_TARGET.includes(type) && !targetId;

  return (
    <AccountPage width="narrow">
      <AccountHeader title={type === "general_question" ? "Poser une question" : SUPPORT_TYPE_LABELS[type]} trail={[SUPPORT_CRUMB, { label: "Nouvelle demande" }]} />
      {missing ? (
        <Alert tone="info">
          {WHERE[type]} <Link to={supportPaths.list}>Retour au support</Link>
        </Alert>
      ) : (
        <NewTicketForm
          type={type}
          targetId={targetId}
          targetLabel={targetLabel}
          onCreated={(ticket) =>
            navigate(supportPaths.ticket(ticket.id), {
              replace: true,
              state: { feedback: ticket.warning ?? `Demande ${ticket.number} envoyée. Vous serez prévenu par email à chaque réponse.` },
            })
          }
        />
      )}
    </AccountPage>
  );
};
