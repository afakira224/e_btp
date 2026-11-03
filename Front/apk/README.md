# BTP Platform — application mobile

Application Flutter des clients de la plateforme : catalogue, panier, commande,
suivi, support et promotions. La gestion d'une boutique (produits, commandes
reçues, promotions, mises en avant) et l'administration restent sur le site web
(`Front/front_web`) : l'application renvoie un gérant vers son espace boutique.

## Lancer

```bash
flutter pub get
flutter run                                   # données simulées, sans back
flutter run --dart-define=USE_MOCK=false \
            --dart-define=API_URL=https://…/api/v1 \
            --dart-define=WEB_URL=https://…
```

| Variable   | Par défaut                     | Rôle                                         |
|------------|--------------------------------|----------------------------------------------|
| `USE_MOCK` | `true`                         | Couche simulée (`lib/shared/api/mock/`)      |
| `API_URL`  | `http://10.0.2.2:5000/api/v1`  | Back (10.0.2.2 = la machine hôte vue de l'émulateur Android) |
| `WEB_URL`  | `https://btp-platform.gn`      | Liens partagés, page de paiement, espace boutique |

Compte de démonstration du mode simulé : `mamadou@btp.com` / `Secret@123`.

## Ce que fait l'application

- **Catalogue et recherche** : rayons, fiches, avis, boutiques, nouveautés,
  meilleures ventes (unités livrées sur 30 jours), promotions.
- **Prix** : calculés par le serveur. Prix barré = plus bas des 30 derniers
  jours, dès 5 % de remise. Vente flash avec compte à rebours, date de fin
  d'une promotion, prix par quantité (seuls les paliers plus avantageux que le
  prix du moment s'affichent).
- **Promotions** : campagnes de la plateforme (`/campagnes/:slug`), produits
  phares d'une boutique, places sponsorisées (accueil, recherche, rayons,
  produits similaires, page Promotions), chacune marquée « Sponsorisé » avec
  son « Pourquoi je vois ceci ? ». Une visite depuis une place sponsorisée
  porte `src=boost:<id>`.
- **Panier** : un mode de livraison par boutique, livraison offerte et reste à
  atteindre, économies, prix changé depuis l'ajout.
- **Commande** (`/panier/commande`) : livraison par boutique, adresse ou
  téléphone, paiement à la livraison ou en ligne, code de réduction. Un prix
  monté depuis l'ajout répond 409 : le panier est remis au prix du moment.
  Le paiement en ligne passe par le prestataire simulé du back
  (`/panier/paiement/:orderId`) ; un refus ou 30 minutes sans paiement
  annulent la commande et remettent les articles dans le panier.
- **Suivi** : une sous-commande par boutique, avec son statut, son échéance,
  son code de retrait et son historique. Annulation avant expédition, retour
  dans les 7 jours après livraison, « Signaler un problème ».
- **Support** (`/compte/support`) : réclamations, signalements d'annonce ou de
  boutique, questions, échanges avec la boutique et l'équipe, proposition à
  accepter ou arbitrage, contestation d'une mesure. « Nous contacter » sans
  compte.
- **Vendre sur la plateforme** (`/compte/vendre`) : demande d'ouverture de
  boutique, suivi, annulation.

Les liens du site (`/produits/…`, `/campagnes/…`, `/paiement/…`,
`/compte/boutique`, `/contact`…) sont traduits vers les écrans de
l'application par `_fromWebPath` (`lib/app/router.dart`).

## Organisation

```
lib/
  app/          routes, thème, navigation entre onglets
  entities/     modèles lus depuis l'API (recopie des DTO du back)
  features/     un dossier par parcours (catalog, cart, account, support…)
  shared/
    api/        client HTTP, couche simulée
    ui/         composants communs
```

La couche simulée reprend les routes et les règles du back : sous-commandes
par boutique et leurs délais (confirmation 48 h, retrait 7 jours, retour
7 jours), moteur de prix, codes, ventes flash, campagnes, boosts et
plafond de 3 expositions par jour, support, demandes de boutique. Ses
promotions sont recréées à chaque lancement avec des dates relatives ; seuls
les compteurs sont gardés sur l'appareil.

## Vérifier

```bash
flutter analyze
flutter test        # dont test/mock_flows_test.dart : les parcours de bout en bout
```
