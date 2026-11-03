import { useState, type FormEvent } from "react";
import {
  SANCTION_LABELS,
  SANCTION_TARGET_LABELS,
  SANCTION_TARGETS,
  SUSPENSION_DAYS,
  type Sanction,
  type SanctionTargetKind,
  type SanctionType,
} from "../../../../entities/support";
import { Alert, Button, Choices, TextArea } from "../../../../shared/ui";
import { createSanction } from "../api/support.api";
import styles from "./SanctionForm.module.css";

export interface SanctionTarget {
  kind: SanctionTargetKind;
  id: string;
  label: string;
}

interface SanctionFormProps {
  targets: SanctionTarget[];
  ticketId?: string | undefined;
  /** Mesure suggérée par le barème, pour la cible principale. */
  suggestion?: { type: SanctionType; days?: number | undefined } | undefined;
  onApplied: (sanction: Sanction) => void;
}

/** Administration : appliquer une mesure à l'une des cibles de la demande. */
export const SanctionForm = ({ targets, ticketId, suggestion, onApplied }: SanctionFormProps) => {
  const [targetKey, setTargetKey] = useState(targets[0] ? `${targets[0].kind}:${targets[0].id}` : "");
  const target = targets.find((candidate) => `${candidate.kind}:${candidate.id}` === targetKey);
  const allowed = (Object.keys(SANCTION_TARGETS) as SanctionType[]).filter((type) => target && SANCTION_TARGETS[type].includes(target.kind));
  const [type, setType] = useState<SanctionType | "">(suggestion && allowed.includes(suggestion.type) ? suggestion.type : "");
  const [days, setDays] = useState(String(suggestion?.days ?? 7));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (targets.length === 0) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!target || !type) return setError("Choisissez une cible et une mesure.");
    if (reason.trim().length < 10) return setError("Motivez la mesure : la personne visée la lira (10 caractères au moins).");
    setBusy(true);
    setError(null);
    try {
      const sanction = await createSanction({
        type,
        targetKind: target.kind,
        targetId: target.id,
        reason: reason.trim(),
        ticketId,
        days: type === "suspension" || type === "promo_ban" ? Number(days) : undefined,
      });
      setReason("");
      onApplied(sanction);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      {targets.length > 1 ? (
        <Choices
          legend="Cible"
          options={targets.map((candidate) => ({ value: `${candidate.kind}:${candidate.id}`, label: candidate.label, hint: SANCTION_TARGET_LABELS[candidate.kind] }))}
          value={targetKey}
          onChange={(value) => {
            setTargetKey(value);
            setType("");
          }}
          disabled={busy}
        />
      ) : (
        <p className={styles.target}>
          {SANCTION_TARGET_LABELS[targets[0]!.kind]} : {targets[0]!.label}
        </p>
      )}
      <Choices
        legend="Mesure"
        inline
        options={allowed.map((value) => ({ value, label: SANCTION_LABELS[value] }))}
        value={type}
        onChange={(value) => setType(value as SanctionType)}
        disabled={busy}
        hint={suggestion ? `Barème : ${SANCTION_LABELS[suggestion.type].toLowerCase()}${suggestion.days ? ` de ${suggestion.days} jours` : ""}.` : undefined}
      />
      {type === "suspension" || type === "promo_ban" ? (
        <Choices
          legend="Durée"
          inline
          options={SUSPENSION_DAYS.map((value) => ({ value: String(value), label: `${value} jours` }))}
          value={days}
          onChange={setDays}
          disabled={busy}
        />
      ) : null}
      <TextArea label="Motif, lu par la personne visée" maxLength={1000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div>
        <Button type="submit" isLoading={busy} className={type === "block" ? styles.danger : undefined}>
          Appliquer la mesure
        </Button>
      </div>
    </form>
  );
};
