import { useCallback, useState } from "react";
import type { Sanction } from "../../../../entities/support";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { AccountPage, AccountPanel } from "../../../account";
import { useResource } from "../../../catalog";
import { fetchSanctions, SanctionList, TicketBoard } from "../../../support";
import { AdminHeader, AdminNav, adminPaths } from "../../shared";
import styles from "./AdminSupportPage.module.css";

const EMPTY = {
  urgent: "Aucune demande urgente : contrefaçon, produit dangereux, arnaque ou menace passent ici en premier.",
  todo: "Rien à trancher. Les demandes arrivent ici sans réponse de la boutique sous 48 heures, ou quand quelqu'un fait appel.",
  reports: "Aucun signalement d'annonce, de boutique, d'avis ou de client en attente.",
  waiting: "Les demandes où une boutique ou un demandeur doit répondre.",
  done: "Les demandes résolues ou fermées.",
};

// ─────────────────────────────────────────────
//  Support — /admin/support?onglet=
//  La file de l'équipe : urgences d'abord, puis ce qui attend une décision,
//  les signalements, et les annonces corrigées dont la boutique demande la
//  remise en ligne.
// ─────────────────────────────────────────────
export const AdminSupportPage = () => {
  useDocumentTitle("Support");
  const [version, setVersion] = useState(0);
  const load = useCallback((signal: AbortSignal) => fetchSanctions({ pending: true }, signal), []);
  const pending = useResource<Sanction[]>(load, [], `pending:${version}`);

  return (
    <AccountPage>
      <AdminHeader
        title="Support"
        lede="Réclamations sans accord, signalements, questions et contestations. Le délai de réponse est de 72 heures, 4 heures ouvrées pour une urgence."
        trail={[{ label: "Support" }]}
      />
      <AdminNav />
      <div className={styles.page}>
        {pending.data.length > 0 ? (
          <AccountPanel title="Remises en ligne demandées" description="La boutique dit avoir corrigé l'annonce : vérifiez-la, puis remettez-la en ligne ou laissez-la masquée.">
            <SanctionList sanctions={pending.data} viewer="admin" onChanged={() => setVersion((value) => value + 1)} />
          </AccountPanel>
        ) : null}
        <TicketBoard scope="admin" defaultTab="todo" detailPath={(ticket) => adminPaths.supportTicket(ticket.id)} empty={EMPTY} />
      </div>
    </AccountPage>
  );
};
