import { isPickupDelivery, ShopOrderStatus, type ShopOrder, type ShopOrderViewer } from "../../../../entities/order";
import { formatPrice } from "../../../../entities/product";
import { formatDeadline, timeLeft } from "./format";

const MAX_DELIVERY_ATTEMPTS = 2;

const due = (part: ShopOrder): string =>
  part.deadlineAt ? `${formatDeadline(part.deadlineAt)} (${timeLeft(part.deadlineAt)})` : "bientôt";

/**
 * Où en est la sous-commande et ce qui se passe ensuite, pour ce lecteur.
 * Chaque attente a son échéance : on la dit, avec ce qui arrive si personne
 * ne fait rien — c'est ce qui rend les délais automatiques prévisibles.
 */
export const guidanceFor = (part: ShopOrder, viewer: ShopOrderViewer): string | null => {
  const client = viewer === "client";
  const pickup = isPickupDelivery(part.delivery);

  switch (part.status) {
    case ShopOrderStatus.AWAITING_PAYMENT:
      return client
        ? "La boutique recevra cette commande dès votre paiement confirmé."
        : "Paiement en ligne pas encore confirmé : la boutique ne voit pas encore cette commande.";
    case ShopOrderStatus.PENDING:
      return client
        ? `La boutique doit confirmer la disponibilité des articles avant le ${due(part)}. Sans réponse, la commande expire et vous êtes remboursé si vous avez payé.`
        : `À confirmer avant le ${due(part)}. Sans réponse, la commande expire et le client est remboursé.`;
    case ShopOrderStatus.CONFIRMED:
      return client
        ? "La boutique prépare votre commande."
        : pickup
          ? "Préparez la commande, puis mettez-la à disposition : le client recevra son code de remise."
          : "Préparez la commande, puis expédiez-la : le client recevra son code de remise.";
    case ShopOrderStatus.SHIPPED:
      return client
        ? "Votre commande est en route. Donnez votre code de remise au livreur, et seulement à la remise du colis."
        : "En livraison. À la remise, demandez au client son code : il prouve la livraison.";
    case ShopOrderStatus.READY_FOR_PICKUP:
      return client
        ? `Votre commande vous attend en boutique jusqu'au ${due(part)}. Présentez votre code de remise au retrait.`
        : `Le client a jusqu'au ${due(part)} pour venir. Sans retrait, la commande expire et son stock revient en vente.`;
    case ShopOrderStatus.DELIVERY_FAILED:
      return client
        ? "La livraison n'a pas abouti. La boutique vous recontacte pour une nouvelle tentative."
        : part.deliveryAttempts < MAX_DELIVERY_ATTEMPTS
          ? `Relivrez (tentative ${part.deliveryAttempts + 1} sur ${MAX_DELIVERY_ATTEMPTS}), ou abandonnez la livraison une fois le colis revenu.`
          : "Plus de nouvelle tentative possible : abandonnez la livraison une fois le colis revenu en boutique.";
    case ShopOrderStatus.DELIVERED:
      return client
        ? `Livrée. Un problème ? Vous pouvez demander un retour jusqu'au ${due(part)}.`
        : `Le client peut demander un retour jusqu'au ${due(part)} ; ensuite, la commande est terminée.`;
    case ShopOrderStatus.RETURN_REQUESTED:
      return client
        ? `La boutique doit répondre avant le ${due(part)}. Sans réponse, l'administration tranchera.`
        : viewer === "shop"
          ? `Répondez avant le ${due(part)} : sans réponse, l'administration tranchera.`
          : `La boutique a jusqu'au ${due(part)} pour répondre.`;
    case ShopOrderStatus.DISPUTED:
      return viewer === "admin"
        ? "Lisez la demande du client et la réponse de la boutique, puis tranchez."
        : "Litige : l'administration examine la demande et tranchera.";
    case ShopOrderStatus.COMPLETED:
      return "Commande terminée.";
    default:
      return null;
  }
};

/** Où en est l'argent d'une sous-commande qui a mal fini. */
export const refundNoteFor = (part: ShopOrder, viewer: ShopOrderViewer): string | null => {
  const { payment } = part;
  switch (payment.status) {
    case "refund_pending":
      if (payment.method === "on_delivery") {
        if (viewer === "client") {
          return `La boutique vous rembourse ${formatPrice(payment.refundedAmount)} à la reprise du produit.`;
        }
        return viewer === "shop"
          ? `Remboursez ${formatPrice(payment.refundedAmount)} au client à la reprise du produit, puis confirmez-le.`
          : `La boutique rembourse ${formatPrice(payment.refundedAmount)} au client à la reprise du produit, puis le confirme.`;
      }
      return `Remboursement de ${formatPrice(payment.refundedAmount)} en cours.`;
    case "refunded":
    case "partially_refunded":
      return `${formatPrice(payment.refundedAmount)} remboursés${payment.refundedAt ? ` le ${formatDeadline(payment.refundedAt)}` : ""}.`;
    case "void":
      return viewer === "client" ? "Rien n'a été payé : rien à rembourser." : "Rien n'avait été encaissé.";
    default:
      return null;
  }
};
