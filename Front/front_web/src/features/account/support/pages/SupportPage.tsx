import { useCallback, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Sanction } from "../../../../entities/support";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { useResource } from "../../../catalog";
import { fetchMySanctions, SanctionList, supportPaths, TicketBoard } from "../../../support";
import { AccountHeader, AccountPanel, AccountPage } from "../../shared";
import styles from "./SupportPage.module.css";

const EMPTY = {
  open: "Un souci avec une commande ? Ouvrez-la et choisissez « Signaler un problème » sous la boutique concernée.",
  done: "Les demandes réglées ou fermées s'affichent ici.",
};

// ─────────────────────────────────────────────
//  Support — /compte/support
//  Les demandes ouvertes par le client (problème de commande, retour,
//  signalement, question) et, s'il y en a, les mesures qui le visent.
// ─────────────────────────────────────────────
export const SupportPage = () => {
  const feedback = (useLocation().state as { feedback?: string } | null)?.feedback ?? null;
  const [version, setVersion] = useState(0);
  const load = useCallback((signal: AbortSignal) => fetchMySanctions(signal), []);
  const sanctions = useResource<Sanction[]>(load, [], `mine:${version}`);

  useDocumentTitle("Support");

  return (
    <AccountPage width="narrow">
      <AccountHeader
        title="Support"
        lede="Vos demandes à une boutique ou à l'équipe de la plateforme, et leurs réponses."
        trail={[{ label: "Support" }]}
        action={
          <Link className={styles.action} to={supportPaths.create("general_question")}>
            Poser une question
          </Link>
        }
      />
      {feedback ? (
        <div className={styles.alert}>
          <Alert tone="success">{feedback}</Alert>
        </div>
      ) : null}

      {sanctions.data.length > 0 ? (
        <div className={styles.sanctions}>
          <AccountPanel title="Mesures vous concernant" description="Prises par l'équipe de la plateforme. Vous pouvez contester une mesure en cours.">
            <SanctionList
              sanctions={sanctions.data}
              viewer="concerned"
              onChanged={() => setVersion((value) => value + 1)}
              appealPath={(sanction) => supportPaths.create("sanction_appeal", { id: sanction.id, label: sanction.target.label })}
            />
          </AccountPanel>
        </div>
      ) : null}

      <TicketBoard scope="mine" defaultTab="open" detailPath={(ticket) => supportPaths.ticket(ticket.id)} empty={EMPTY} />
    </AccountPage>
  );
};
