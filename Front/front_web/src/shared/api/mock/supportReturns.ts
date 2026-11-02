import type { MockShopOrder } from "./accountSeed";
import type { MockDb } from "./mockDb";
import { PLATFORM_NAME, type MockSupportMessage, type MockSupportTicket } from "./supportSeed";
import { reasonLabel, supportScheduleFor } from "./supportRules";

// ─────────────────────────────────────────────
//  Le retour côté support — copie de Back/src/shared/services/support.returns.ts.
//  « Demander un retour » ouvre une demande de type retour ; son statut suit
//  la sous-commande (retour demandé, litige, retourné) et ses délais.
// ─────────────────────────────────────────────

export const nextSupportNumber = (db: MockDb): string => {
  db.supportSeq += 1;
  return `SUP-${String(db.supportSeq).padStart(6, "0")}`;
};

const id = () => `sup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const message = (
  ticketId: string,
  at: string,
  author: MockSupportMessage["author"],
  body: string,
  kind: MockSupportMessage["kind"] = "event",
  attachments: MockSupportMessage["attachments"] = []
): MockSupportMessage => ({
  id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  ticketId,
  author,
  visibility: "public",
  kind,
  body,
  attachments,
  containsContact: false,
  createdAt: at,
});

const platform = { userId: null, party: "system" as const, name: PLATFORM_NAME };

export const syncReturnTicket = (
  db: MockDb,
  part: MockShopOrder,
  action: string,
  input: { reason?: string | undefined; note?: string | undefined; resolution?: string | undefined; photos?: string[] | undefined },
  now: Date,
  userId?: string
): void => {
  const stamp = now.toISOString();
  if (action === "return") {
    const client = db.users.find((user) => user._id === part.userId);
    const name = client ? `${client.prenom} ${client.nom}`.trim() : "Client";
    const reason = input.reason ?? "not_as_described";
    const ticket: MockSupportTicket = {
      id: id(),
      number: nextSupportNumber(db),
      type: "return",
      reason,
      subject: `${reasonLabel("return", reason)} — ${part.reference}`,
      status: "awaiting_shop",
      priority: "normal",
      requester: { userId: part.userId, accountType: "user", name, email: client?.email },
      target: { kind: "shop_order", id: part.id, label: part.reference },
      boutiqueId: part.boutiqueId,
      requesterShopId: null,
      orderId: part.orderId,
      assignee: null,
      escalatedAt: null,
      shopRespondedAt: null,
      adminRespondedAt: null,
      ...supportScheduleFor({ type: "return", priority: "normal" }, "awaiting_shop", now),
      proposal: null,
      resolution: null,
      appeal: null,
      resolvedAt: null,
      closedAt: null,
      reopenedAt: null,
      satisfaction: null,
      lastMessageAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    };
    db.supportTickets.push(ticket);
    db.supportMessages.push(
      message(
        ticket.id,
        stamp,
        { userId: part.userId, party: "requester", name },
        input.note?.trim() || `Retour demandé : ${reasonLabel("return", reason)}.`,
        "message",
        (input.photos ?? []).map((url, index) => ({ url, name: `photo-${index + 1}`, mimetype: "image/jpeg", size: 0 }))
      )
    );
    return;
  }

  const ticket = [...db.supportTickets]
    .reverse()
    .find((candidate) => candidate.type === "return" && candidate.target?.id === part.id && candidate.status !== "closed");
  if (!ticket) return;
  const settle = (status: MockSupportTicket["status"]) => {
    ticket.status = status;
    Object.assign(ticket, supportScheduleFor(ticket, status, now));
  };
  const shop = { userId: null, party: "shop" as const, name: part.boutiqueNom ?? "Boutique" };

  switch (action) {
    case "accept-return":
      ticket.shopRespondedAt = stamp;
      ticket.resolution = { outcome: "upheld", note: "Retour accepté par la boutique.", by: "shop", at: stamp };
      ticket.resolvedAt = stamp;
      settle("resolved");
      db.supportMessages.push(message(ticket.id, stamp, shop, "La boutique accepte le retour : elle rembourse à la reprise du produit."));
      break;
    case "reject-return":
      ticket.shopRespondedAt = stamp;
      ticket.escalatedAt = stamp;
      settle("awaiting_admin");
      db.supportMessages.push(message(ticket.id, stamp, shop, input.note?.trim() || "La boutique refuse le retour.", "message"));
      db.supportMessages.push(message(ticket.id, stamp, platform, "La boutique refuse le retour : l'administration va trancher."));
      break;
    case "escalate":
      ticket.escalatedAt = stamp;
      settle("awaiting_admin");
      db.supportMessages.push(message(ticket.id, stamp, platform, "La boutique n'a pas répondu sous 48 heures : l'administration va trancher."));
      break;
    case "resolve-dispute":
      ticket.resolution = {
        outcome: input.resolution === "rejected" ? "rejected" : "upheld",
        note: input.note?.trim(),
        by: "admin",
        decidedBy: userId ?? null,
        at: stamp,
      };
      ticket.resolvedAt = stamp;
      ticket.adminRespondedAt = stamp;
      settle("resolved");
      db.supportMessages.push(
        message(ticket.id, stamp, { userId: null, party: "admin", name: PLATFORM_NAME }, input.note?.trim() || "Décision de l'administration.", "decision")
      );
      break;
    case "confirm-refund":
      db.supportMessages.push(message(ticket.id, stamp, platform, "Remboursement confirmé."));
      break;
    default:
      if (part.status === "completed" || part.status === "cancelled") {
        settle("closed");
        ticket.closedAt = stamp;
      } else {
        return;
      }
  }
  ticket.lastMessageAt = stamp;
  ticket.updatedAt = stamp;
};
