import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ACTION_SPECS,
  RESOLUTION_LABELS,
  type Resolution,
  type ShopOrder,
  type ShopOrderAction,
} from "../../../../entities/order";
import { formatPrice } from "../../../../entities/product";
import { Alert, Button, Choices, Input, TextArea } from "../../../../shared/ui";
import { performShopOrderAction } from "../api/orders.api";
import styles from "./ShopOrderActions.module.css";

/** Ce que l'on annonce une fois l'action enregistrée. */
const DONE_MESSAGES: Record<ShopOrderAction, string> = {
  confirm: "Commande confirmée : le client est prévenu.",
  refuse: "Commande refusée : le client est prévenu et sera remboursé s'il avait payé.",
  ship: "Commande expédiée : le client a reçu son code de remise.",
  ready: "Commande mise à disposition : le client a reçu son code de remise.",
  deliver: "Remise enregistrée : la commande est livrée.",
  "delivery-failed": "Échec de livraison enregistré : le client est prévenu.",
  retry: "Nouvelle tentative de livraison lancée.",
  abandon: "Livraison abandonnée : le client sera remboursé s'il avait payé.",
  cancel: "Commande annulée. Vous serez remboursé si vous aviez payé en ligne.",
  "admin-cancel": "Commande annulée : le client et la boutique sont prévenus.",
  return: "Demande de retour envoyée : la boutique a 48 heures pour répondre.",
  "accept-return": "Retour accepté : remboursez le client à la reprise du produit.",
  "reject-return": "Retour refusé : l'administration va trancher.",
  "resolve-dispute": "Décision enregistrée : le client et la boutique sont prévenus.",
  "confirm-refund": "Remboursement confirmé.",
};

const MAX_PHOTOS = 3;

interface ActionFormProps {
  part: ShopOrder;
  action: ShopOrderAction;
  onCancel: () => void;
  onDone: (part: ShopOrder, message: string) => void;
}

const ActionForm = ({ part, action, onCancel, onDone }: ActionFormProps) => {
  const spec = ACTION_SPECS[action];
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [resolution, setResolution] = useState<Resolution | "">("");
  const [refundAmount, setRefundAmount] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const photoId = useId();
  const formRef = useRef<HTMLFormElement | null>(null);

  // Le formulaire s'ouvre sous les boutons : on y amène le regard et le focus.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>("input, textarea, select, button")?.focus();
  }, []);

  const noteRequired = spec.note === "required" || reason === "other";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // Les mêmes règles que le serveur, pour répondre sans aller-retour ; il
    // revérifie tout de son côté.
    if (spec.reasonRequired && !reason) return setError("Choisissez un motif.");
    if (noteRequired && !note.trim()) {
      return setError(reason === "other" ? "Précisez le motif « Autre »." : `${spec.noteLabel ?? "La précision"} est requise.`);
    }
    if (spec.code && !/^\d{6}$/.test(code.trim())) return setError("Le code de remise compte 6 chiffres.");
    if (spec.resolution && !resolution) return setError("Choisissez une décision.");
    const amount = Number.parseInt(refundAmount, 10);
    if (resolution === "refund_partial" && (!Number.isInteger(amount) || amount <= 0 || amount >= part.amount)) {
      return setError(`Le remboursement partiel doit être un entier entre 1 et ${part.amount - 1} GNF.`);
    }
    if (photos.length > MAX_PHOTOS) return setError(`${MAX_PHOTOS} photos au plus.`);

    setBusy(true);
    setError(null);
    try {
      const updated = await performShopOrderAction(part.id, action, {
        reason: reason || undefined,
        note: note.trim() || undefined,
        code: spec.code ? code.trim() : undefined,
        resolution: resolution || undefined,
        refundAmount: resolution === "refund_partial" ? amount : undefined,
        photos,
      });
      onDone(updated, DONE_MESSAGES[action]);
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  };

  return (
    <form ref={formRef} className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      <p className={styles.question}>{spec.confirm}</p>

      {spec.reasons ? (
        <Choices
          legend={spec.reasonRequired ? "Motif" : "Motif — facultatif"}
          options={Object.entries(spec.reasons).map(([value, label]) => ({ value, label }))}
          value={reason}
          onChange={setReason}
          disabled={busy}
        />
      ) : null}

      {spec.resolution ? (
        <Choices
          legend="Décision"
          options={(Object.keys(RESOLUTION_LABELS) as Resolution[]).map((value) => ({
            value,
            label: RESOLUTION_LABELS[value],
            hint:
              value === "refund_full"
                ? `${formatPrice(part.amount)} rendus au client`
                : value === "rejected"
                  ? "La commande est terminée, sans remboursement"
                  : undefined,
          }))}
          value={resolution}
          onChange={(value) => setResolution(value as Resolution)}
          disabled={busy}
        />
      ) : null}

      {resolution === "refund_partial" ? (
        <Input
          label="Montant remboursé (GNF)"
          inputMode="numeric"
          value={refundAmount}
          onChange={(event) => setRefundAmount(event.target.value.replace(/\D/g, ""))}
          hint={`Entre 1 et ${formatPrice(part.amount - 1)}.`}
          disabled={busy}
        />
      ) : null}

      {spec.code ? (
        <Input
          label="Code de remise"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          hint="Le client le lit dans son espace « Mes commandes » ou dans l'email reçu à l'expédition."
          disabled={busy}
        />
      ) : null}

      {spec.photos ? (
        <div className={styles.photos}>
          <label className={styles.photoLabel} htmlFor={photoId}>
            Photos {reason === "damaged" ? "— au moins une" : "— facultatif"}
          </label>
          <input
            id={photoId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(event) => setPhotos([...(event.target.files ?? [])].slice(0, MAX_PHOTOS))}
          />
          <span className={styles.photoHint}>
            {photos.length > 0
              ? `${photos.length} photo${photos.length > 1 ? "s" : ""} sélectionnée${photos.length > 1 ? "s" : ""}`
              : `${MAX_PHOTOS} photos au plus.`}
          </span>
        </div>
      ) : null}

      {spec.note ? (
        <TextArea
          label={spec.noteLabel ?? "Précision"}
          optional={!noteRequired}
          maxLength={500}
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={busy}
        />
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className={styles.buttons}>
        <Button type="submit" isLoading={busy} className={spec.danger ? styles.dangerButton : undefined}>
          {spec.label}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Retour
        </Button>
      </div>
    </form>
  );
};

interface ShopOrderActionsProps {
  part: ShopOrder;
  onUpdated: (part: ShopOrder, message: string) => void;
}

// ─────────────────────────────────────────────
//  Boutons d'une sous-commande : exactement ceux que le serveur autorise à
//  ce lecteur, maintenant (`availableActions`). Chaque action ouvre sur place
//  le formulaire qu'elle demande — motif, code de remise, photos, décision —
//  plutôt qu'une boîte de dialogue : on garde la commande sous les yeux.
// ─────────────────────────────────────────────
export const ShopOrderActions = ({ part, onUpdated }: ShopOrderActionsProps) => {
  const [open, setOpen] = useState<ShopOrderAction | null>(null);

  if (part.availableActions.length === 0) return null;

  if (open) {
    return (
      <ActionForm
        key={`${part.id}-${open}`}
        part={part}
        action={open}
        onCancel={() => setOpen(null)}
        onDone={(updated, message) => {
          setOpen(null);
          onUpdated(updated, message);
        }}
      />
    );
  }

  // L'action qui fait avancer la commande d'abord, en bouton plein ; les
  // actions destructrices ensuite, en discret.
  const forward = part.availableActions.filter((action) => !ACTION_SPECS[action].danger);
  const destructive = part.availableActions.filter((action) => ACTION_SPECS[action].danger);

  return (
    <div className={styles.actions}>
      {forward.map((action, index) => (
        <Button key={action} variant={index === 0 ? "primary" : "secondary"} onClick={() => setOpen(action)}>
          {ACTION_SPECS[action].label}
        </Button>
      ))}
      {destructive.map((action) => (
        <Button key={action} variant="ghost" className={styles.danger} onClick={() => setOpen(action)}>
          {ACTION_SPECS[action].label}
        </Button>
      ))}
    </div>
  );
};
