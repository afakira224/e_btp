import { useMemo, useState } from "react";
import type { ProductDeliveryInput, ShopDeliveryOverview } from "../../../../entities/delivery";
import { formatPrice, productName, type ProductBoutique } from "../../../../entities/product";
import type { Shop } from "../../../../entities/shop";
import { Alert, Button, Input } from "../../../../shared/ui";
import { useForm } from "../../../../shared/hooks/useForm";
import { toDraft, toSettingsInput, type DeliveryDraft, type OfferSubmission } from "../../shared";
import { offerSchema, toInteger, type OfferValues } from "../validation/offer.schema";
import { OfferDeliverySection } from "./OfferDeliverySection";
import { PhotosField } from "./PhotosField";
import { ProductPicker } from "./ProductPicker";
import styles from "./OfferForm.module.css";

interface OfferFormProps {
  shop: Shop;
  shopDelivery: ShopDeliveryOverview | null;
  /** Produit à modifier ; absent pour une création. */
  offer?: ProductBoutique | undefined;
  onSubmit: (submission: OfferSubmission, productId: string) => Promise<void>;
  onCancel: () => void;
}

const toValues = (offer: ProductBoutique | undefined): OfferValues => {
  const custom = offer?.delivery?.source === "product" ? offer.delivery : undefined;
  return {
    productId: offer?.productId ?? "",
    price: offer ? String(offer.price) : "",
    stock: offer ? String(offer.stock) : "",
    // Un nouveau produit suit la boutique : c'est le choix par défaut.
    useShopSettings: custom === undefined,
    ...(custom ? toDraft(custom) : { modes: [], flatRateFee: "" }),
    images: [],
    keptImages: offer?.urlImages ?? [],
  };
};

export const OfferForm = ({ shop, shopDelivery, offer, onSubmit, onCancel }: OfferFormProps) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const isEdit = offer !== undefined;
  const initialValues = useMemo(() => toValues(offer), [offer]);
  const schema = useMemo(
    () => offerSchema({ isEdit, shopAddress: shop.adresse }),
    [isEdit, shop.adresse]
  );

  const { values, errorOf, isSubmitting, setValue, handleBlur, handleSubmit } = useForm<OfferValues>({
    initialValues,
    schema,
    onSubmit: async (submitted) => {
      setServerError(null);
      const delivery: ProductDeliveryInput = submitted.useShopSettings
        ? { useShopSettings: true }
        : { useShopSettings: false, ...toSettingsInput(submitted) };
      try {
        await onSubmit(
          {
            price: toInteger(submitted.price),
            stock: toInteger(submitted.stock),
            delivery,
            images: submitted.images,
            imagesToRemove: (offer?.urlImages ?? []).filter((url) => !submitted.keptImages.includes(url)),
          },
          submitted.productId
        );
      } catch (caught) {
        // 409 déjà en vente, 400 règle de livraison, 403 boutique d'un autre.
        setServerError((caught as Error).message);
      }
    },
  });

  const chooseSource = (useShopSettings: boolean) => {
    setValue("useShopSettings", useShopSettings);
    // Première personnalisation : on part des réglages de la boutique, que
    // le vendeur n'a plus qu'à ajuster.
    if (!useShopSettings && values.modes.length === 0 && shopDelivery) {
      const draft = toDraft(shopDelivery);
      setValue("modes", draft.modes);
      setValue("flatRateFee", draft.flatRateFee);
    }
  };

  const changeDraft = (next: DeliveryDraft) => {
    if (next.modes !== values.modes) setValue("modes", next.modes);
    if (next.flatRateFee !== values.flatRateFee) setValue("flatRateFee", next.flatRateFee);
  };

  const text = (name: "price" | "stock") => ({
    name,
    value: values[name],
    error: errorOf(name),
    inputMode: "numeric" as const,
    autoComplete: "off",
    disabled: isSubmitting,
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(name, event.target.value),
    onBlur: () => handleBlur(name),
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {serverError ? <Alert tone="danger">{serverError}</Alert> : null}

      {offer ? (
        <p className={styles.product}>
          <span className={styles.productLabel}>Produit</span>
          {productName(offer)}
        </p>
      ) : (
        <ProductPicker
          value={values.productId}
          onChange={(productId) => setValue("productId", productId)}
          onBlur={() => handleBlur("productId")}
          error={errorOf("productId")}
        />
      )}

      <div className={styles.row}>
        <Input
          label="Prix de vente (GNF)"
          placeholder="78000"
          hint={
            offer?.discountPrice != null
              ? `Prix remisé en cours : ${formatPrice(offer.discountPrice)} (inchangé ici).`
              : undefined
          }
          {...text("price")}
        />
        <Input label="Stock disponible" placeholder="40" {...text("stock")} />
      </div>

      <PhotosField
        existing={offer?.urlImages ?? []}
        kept={values.keptImages}
        onKeptChange={(kept) => setValue("keptImages", kept)}
        files={values.images}
        onFilesChange={(files) => setValue("images", files)}
        error={errorOf("images")}
        disabled={isSubmitting}
      />

      <OfferDeliverySection
        shop={shop}
        shopDelivery={shopDelivery}
        useShopSettings={values.useShopSettings}
        onUseShopSettings={chooseSource}
        draft={{ modes: values.modes, flatRateFee: values.flatRateFee }}
        onDraftChange={changeDraft}
        onBlur={handleBlur}
        errors={{ modes: errorOf("modes"), flatRateFee: errorOf("flatRateFee") }}
        wasCustom={offer?.delivery?.source === "product"}
        disabled={isSubmitting}
      />

      <div className={styles.actions}>
        <Button type="submit" isLoading={isSubmitting}>
          {isEdit ? "Enregistrer les modifications" : "Ajouter le produit"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Annuler
        </Button>
      </div>
    </form>
  );
};
