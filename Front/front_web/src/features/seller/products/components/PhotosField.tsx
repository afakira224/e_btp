import { useEffect, useId, useMemo } from "react";
import { assetUrl } from "../../../../shared/config/env";
import { IMAGE_TYPES } from "../validation/offer.schema";
import styles from "./PhotosField.module.css";

interface PhotosFieldProps {
  /** Photos déjà en ligne (modification). */
  existing: string[];
  kept: string[];
  onKeptChange: (kept: string[]) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  error?: string | undefined;
  disabled?: boolean;
}

export const PhotosField = ({
  existing,
  kept,
  onKeptChange,
  files,
  onFilesChange,
  error,
  disabled = false,
}: PhotosFieldProps) => {
  const inputId = useId();
  const errorId = useId();

  // Aperçus des fichiers choisis, libérés dès qu'ils ne servent plus.
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        Photos
      </label>

      {existing.length > 0 || files.length > 0 ? (
        <ul className={styles.grid}>
          {existing.map((url) => {
            const keep = kept.includes(url);
            return (
              <li key={url} className={[styles.photo, keep ? "" : styles.removed].filter(Boolean).join(" ")}>
                <img src={assetUrl(url)} alt="" />
                <button
                  type="button"
                  className={styles.action}
                  disabled={disabled}
                  onClick={() =>
                    onKeptChange(keep ? kept.filter((candidate) => candidate !== url) : [...kept, url])
                  }
                >
                  {keep ? "Retirer" : "Garder"}
                </button>
              </li>
            );
          })}
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className={styles.photo}>
              <img src={previews[index]} alt="" />
              <span className={styles.tag}>Nouvelle</span>
              <button
                type="button"
                className={styles.action}
                disabled={disabled}
                onClick={() => onFilesChange(files.filter((_, position) => position !== index))}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        id={inputId}
        className={styles.input}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        multiple
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          const chosen = Array.from(event.target.files ?? []);
          if (chosen.length > 0) onFilesChange([...files, ...chosen]);
          // Permet de choisir à nouveau le même fichier après l'avoir retiré.
          event.target.value = "";
        }}
      />
      <span className={styles.hint}>JPEG, PNG, WebP ou GIF — 5 Mo par photo, 10 au plus.</span>

      {error ? (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
};
