import { useCallback, useState } from "react";
import type { ZodType } from "zod";

type Errors<T> = Partial<Record<keyof T, string>>;

interface UseFormOptions<T> {
  initialValues: T;
  schema: ZodType<T>;
  onSubmit: (values: T) => Promise<void> | void;
}

// ─────────────────────────────────────────────
//  useForm
//  Formulaire contrôlé validé par un schéma Zod.
//  Un champ n'affiche son erreur qu'après avoir été quitté (blur) ou après
//  une tentative d'envoi : on ne réprimande pas l'utilisateur pendant la frappe.
// ─────────────────────────────────────────────
export const useForm = <T extends Record<string, unknown>>({
  initialValues,
  schema,
  onSubmit,
}: UseFormOptions<T>) => {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Errors<T>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = useCallback(
    (candidate: T): Errors<T> => {
      const result = schema.safeParse(candidate);
      if (result.success) return {};

      const next: Errors<T> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof T | undefined;
        // Seule la première erreur par champ est montrée : une liste de
        // reproches empilés est illisible.
        if (field !== undefined && next[field] === undefined) {
          next[field] = issue.message;
        }
      }
      return next;
    },
    [schema]
  );

  const setValue = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setValues((previous) => {
        const next = { ...previous, [field]: value };
        // Le champ déjà signalé se corrige en direct : le message disparaît
        // dès que la saisie devient valide.
        if (touched[field]) {
          const fieldError = validate(next)[field];
          setErrors((current) => ({ ...current, [field]: fieldError }));
        }
        return next;
      });
    },
    [touched, validate]
  );

  const handleBlur = useCallback(
    (field: keyof T) => {
      setTouched((previous) => ({ ...previous, [field]: true }));
      setErrors((current) => ({ ...current, [field]: validate(values)[field] }));
    },
    [validate, values]
  );

  const handleSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();

      const found = validate(values);
      setErrors(found);
      setTouched(
        Object.keys(values).reduce(
          (acc, key) => ({ ...acc, [key]: true }),
          {} as Partial<Record<keyof T, boolean>>
        )
      );

      if (Object.keys(found).length > 0) return;

      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } finally {
        setIsSubmitting(false);
      }
    },
    [onSubmit, validate, values]
  );

  /** Erreur à afficher : uniquement si le champ a déjà été visité. */
  const errorOf = useCallback(
    (field: keyof T): string | undefined =>
      touched[field] ? errors[field] : undefined,
    [errors, touched]
  );

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  return { values, errorOf, isSubmitting, setValue, handleBlur, handleSubmit, reset };
};
