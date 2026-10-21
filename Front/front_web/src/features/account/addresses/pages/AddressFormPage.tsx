import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Address, AddressInput } from "../../../../entities/address";
import { getFullName } from "../../../../entities/user";
import { Alert } from "../../../../shared/ui";
import { useDocumentTitle } from "../../../../shared/hooks/useDocumentTitle";
import { useAuth } from "../../../auth";
import { useResource } from "../../../catalog";
import {
  AccountHeader,
  AccountPage,
  AccountPanel,
  createAddress,
  fetchAddresses,
  updateAddress,
} from "../../shared";
import { AddressForm } from "../components/AddressForm";
import styles from "./AddressFormPage.module.css";

const LIST_PATH = "/compte/adresses";
const LIST_CRUMB = { label: "Mes adresses", to: LIST_PATH };

/** Message passé à la liste au retour, affiché une fois puis oublié. */
export interface AddressListState {
  feedback?: string;
}

// ─────────────────────────────────────────────
//  Ajout et modification d'une adresse — pages à part entière :
//   • /compte/adresses/nouvelle
//   • /compte/adresses/:addressId/modifier
//  La liste disparaît pendant la saisie ; enregistrer ou annuler y ramène,
//  tout comme le bouton Précédent.
//
//  Le carnet est relu à l'arrivée : il dit à la fois si c'est la première
//  adresse (elle sera d'office par défaut) et, en modification, quelle est
//  l'adresse à éditer — une seule lecture pour les deux pages.
// ─────────────────────────────────────────────
export const AddressFormPage = () => {
  const { addressId } = useParams<{ addressId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const userId = user?._id ?? "";
  const isEdit = addressId !== undefined;

  const load = useCallback((signal: AbortSignal) => fetchAddresses(userId, signal), [userId]);
  const book = useResource<Address[] | null>(load, null, userId);
  const current = isEdit ? book.data?.find((address) => address.id === addressId) : undefined;

  const title = isEdit
    ? current
      ? `Modifier « ${current.label || "Adresse"} »`
      : "Modifier l'adresse"
    : "Nouvelle adresse";

  useDocumentTitle(title);

  if (!user) return null;

  const backToList = (feedback?: string) =>
    navigate(LIST_PATH, feedback ? { state: { feedback } satisfies AddressListState } : undefined);

  const submit = async (input: AddressInput) => {
    if (isEdit && addressId) {
      await updateAddress(addressId, input);
      backToList("Adresse mise à jour.");
    } else {
      await createAddress(userId, input);
      backToList("Adresse ajoutée.");
    }
  };

  const header = (
    <AccountHeader
      title={title}
      lede={
        isEdit
          ? undefined
          : "Domicile, bureau ou chantier : l'adresse où les dépôts livreront vos commandes."
      }
      trail={[LIST_CRUMB, { label: isEdit ? "Modifier" : "Nouvelle adresse" }]}
    />
  );

  if (book.error) {
    return (
      <AccountPage width="narrow">
        {header}
        <Alert tone="danger">{book.error}</Alert>
      </AccountPage>
    );
  }

  if (book.isLoading || !book.data) {
    return (
      <AccountPage width="narrow">
        {header}
        <div className={styles.skeleton} aria-hidden="true" />
      </AccountPage>
    );
  }

  // Lien de modification périmé : adresse supprimée entre-temps, ou
  // identifiant bricolé dans l'URL.
  if (isEdit && !current) {
    return (
      <AccountPage width="narrow">
        {header}
        <Alert tone="danger">Cette adresse n'existe pas ou a été supprimée.</Alert>
      </AccountPage>
    );
  }

  return (
    <AccountPage width="narrow">
      {header}
      <AccountPanel title="Adresse de livraison">
        <AddressForm
          // Une adresse = un formulaire neuf : passer d'une adresse à une
          // autre ne doit pas reprendre la saisie de la précédente.
          key={addressId ?? "nouvelle"}
          initial={current}
          defaultRecipient={getFullName(user)}
          defaultPhone={isEdit ? undefined : user.telephone}
          // Première adresse : forcément par défaut. En modification, l'adresse
          // par défaut le reste — on en change en choisissant une autre.
          forceDefault={isEdit ? Boolean(current?.isDefault) : book.data.length === 0}
          onSubmit={submit}
          onCancel={() => backToList()}
        />
      </AccountPanel>
    </AccountPage>
  );
};
