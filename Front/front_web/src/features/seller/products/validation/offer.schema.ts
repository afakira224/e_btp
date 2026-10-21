import { z } from "zod";
import { deliveryModesSchema, refineDelivery } from "../../shared";

// ─────────────────────────────────────────────
//  Formulaire produit — bornes de createProductBoutiqueForm /
//  updateProductBoutiqueForm (Back/src/shared/forms/product.form.ts) et de
//  l'upload (fileUpload.ts : jpeg, png, webp, gif, 5 Mo, 10 photos).
//
//  Les champs de livraison sont à plat (useShopSettings, modes, flatRateFee) :
//  chaque erreur s'affiche sous le champ qui la cause.
// ─────────────────────────────────────────────
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES = 10;

const digits = (value: string) => value.replace(/[\s  ]/g, "");

export interface OfferValues extends Record<string, unknown> {
  productId: string;
  price: string;
  stock: string;
  useShopSettings: boolean;
  modes: z.infer<typeof deliveryModesSchema>;
  flatRateFee: string;
  /** Nouvelles photos choisies. */
  images: File[];
  /** Photos déjà en ligne que le vendeur garde (modification). */
  keptImages: string[];
}

export const offerSchema = (options: { isEdit: boolean; shopAddress: string | undefined }) =>
  z
    .object({
      productId: options.isEdit
        ? z.string()
        : z.string().min(1, "Choisissez le produit du catalogue que vous mettez en vente."),
      price: z
        .string()
        .refine((value) => /^\d+$/.test(digits(value)) && Number(digits(value)) > 0, {
          message: "Le prix doit être un nombre entier de GNF supérieur à 0.",
        }),
      stock: z
        .string()
        .refine((value) => /^\d+$/.test(digits(value)), {
          message: "Le stock doit être un nombre entier positif.",
        }),
      useShopSettings: z.boolean(),
      modes: deliveryModesSchema,
      flatRateFee: z.string(),
      images: z
        .array(z.instanceof(File))
        .refine((files) => files.every((file) => IMAGE_TYPES.includes(file.type)), {
          message: "Formats acceptés : JPEG, PNG, WebP ou GIF.",
        })
        .refine((files) => files.every((file) => file.size <= MAX_IMAGE_SIZE), {
          message: "Chaque photo doit peser 5 Mo au plus.",
        }),
      keptImages: z.array(z.string()),
    })
    .superRefine((values, ctx) => {
      const count = values.images.length + values.keptImages.length;
      if (count === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["images"],
          message: options.isEdit
            ? "Gardez au moins une photo du produit."
            : "Ajoutez au moins une photo du produit.",
        });
      }
      if (values.images.length > MAX_IMAGES) {
        ctx.addIssue({ code: "custom", path: ["images"], message: `${MAX_IMAGES} photos au plus par envoi.` });
      }
      // La livraison propre n'est validée que si le vendeur la choisit.
      if (!values.useShopSettings) refineDelivery(values, options.shopAddress, ctx);
    });

export const toInteger = (value: string): number => Number(digits(value));
