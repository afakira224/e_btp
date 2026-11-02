import { useCallback, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Sanction } from "../../../../entities/support";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountPanel } from "../../../account";
import { useResource } from "../../../catalog";
import { fetchMySanctions, SanctionList, TicketBoard } from "../../../support";
import { sellerPaths, useSellerShop } from "../../shared";
import styles from "./ShopSupportPage.module.css";

const EMPTY = {
  todo: "Aucune réclamation n'attend votre réponse. Vous avez 48 heures pour répondre à chacune.",
  waiting: "Les demandes où vous attendez la réponse du client.",
  admin: "Les demandes transmises à l'équipe de la plateforme, qui tranchera.",
  done: "Les demandes réglées ou fermées.",
};

/** Une mesure concerne cette boutique, l'une de ses annonces, ou le compte. */
const concerns = (sanction: Sanction, shopId: string) => sanction.target.kind !== "shop" || sanction.target.id === shopId;

// ─────────────────────────────────────────────
//  Support — /ma-boutique/:boutiqueId/support?onglet=
//  Les réclamations des clients sur les commandes de la boutique, ses
//  propres signalements et questions, et les mesures de la modération.
// ─────────────────────────────────────────────
export const ShopSupportPage = () => {
  const { shop } = useSellerShop();
  const feedback = (useLocation().state as { feedback?: string } | null)?.feedback ?? null;
  const [version, setVersion] = useState(0);
  const load = useCallback((signal: AbortSignal) => fetchMySanctions(signal), []);
  const sanctions = useResource<Sanction[]>(load, [], `shop:${shop.id}:${version}`);
  const mine = sanctions.data.filter((sanction) => concerns(sanction, shop.id));

  useDocumentTitle(`Support — ${shop.nom}`);

  return (
    <div className={styles.page}>
      {feedback ? <Alert tone="success">{feedback}</Alert> : null}

      {shop.suspendedUntil ? (
        <Alert tone="danger">
          Boutique suspendue jusqu'au {new Date(shop.suspendedUntil).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} :
          votre vitrine reste visible, mais aucune nouvelle commande n'est possible. Terminez les commandes en cours.
        </Alert>
      ) : null}

      <div className={styles.toolbar}>
        <p className={styles.hint}>Répondez ici, sans donner votre numéro : l'équipe s'appuie sur ces échanges si le client conteste.</p>
        <Link className={styles.action} to={sellerPaths.newSupport(shop.id, "general_question")}>
          Écrire à l'équipe
        </Link>
      </div>

      <TicketBoard scope="shop" boutiqueId={shop.id} defaultTab="todo" detailPath={(ticket) => sellerPaths.supportTicket(shop.id, ticket.id)} empty={EMPTY} />

      {mine.length > 0 ? (
        <AccountPanel title="Mesures" description="Prises par l'équipe de la plateforme. Une annonce corrigée peut être remise en ligne ; une mesure se conteste une fois.">
          <SanctionList
            sanctions={mine}
            viewer="concerned"
            onChanged={() => setVersion((value) => value + 1)}
            appealPath={(sanction) => sellerPaths.newSupport(shop.id, "sanction_appeal", { id: sanction.id, label: sanction.target.label })}
          />
        </AccountPanel>
      ) : null}
    </div>
  );
};
