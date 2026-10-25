# BTP — API e-commerce

API REST Node.js / Express 5 / TypeScript / MongoDB pour une plateforme e-commerce
multi-boutiques : catalogue, panier, commandes, promotions, avis, favoris et adresses.

## Démarrage

```bash
npm install
cp .env.example .env      # puis renseignez MONGO_URI et SESSION_SECRET
npm run dev
```

L'API écoute sur `http://localhost:5000`, la documentation Swagger sur
`http://localhost:5000/api-docs`, et la sonde de santé sur `/health`.

> **MongoDB doit être un replica set.** Le checkout, les promotions et les avis
> utilisent des transactions. MongoDB Atlas convient tel quel ; en local, démarrez
> mongod avec `--replSet rs0`.

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur en rechargement à chaud (tsx) |
| `npm run build` | Compile TypeScript vers `dist/` |
| `npm start` | Lance la version compilée |
| `npm run seed` | Remplit une base vide avec le catalogue de démonstration |
| `npm run seed:reset` | Vide les collections du seed puis les remplit à nouveau |
| `npm run seed:volume` | Vide, puis catalogue de volume (100 familles, 15 000 sous-catégories, 5,25 millions de produits) |
| `npm run migrate:shop-orders` | Découpe les commandes existantes en sous-commandes par boutique (idempotente) |
| `npm test` | Suite de tests unitaires (aucune base requise) |
| `npm run test:watch` | Tests en mode continu |
| `npm run test:coverage` | Tests + rapport dans `coverage/index.html` |
| `npm run typecheck:tests` | Vérification des types `src/` + `tests/` |

## Données de démonstration

`npm run seed` remplit MongoDB avec le même catalogue que le front web et l'application mobile :

- 2 familles, 6 catégories et 22 sous-catégories ;
- 6 boutiques, chacune avec son gérant ;
- 32 produits et 32 offres, avec **5 photos chacun** dans `uploads/seed/products/`, servies sous `/uploads/seed/products/…` ;
- une vente flash en cours et deux coupons (`BIENVENUE10`, `CHANTIER50`) ;
- 18 avis ;
- un compte client `mamadou@btp.com` avec 2 adresses, 6 commandes découpées en sous-commandes par boutique, des favoris et des produits récemment vus.

Tous les comptes sont vérifiés. Le mot de passe est `Secret@123`, ou la valeur de `SEED_PASSWORD`. Ces identifiants servent au **développement uniquement** : le seed refuse de tourner quand `NODE_ENV=production`, et sur une base qui contient déjà un catalogue (utilisez alors `npm run seed:reset`).

### Catalogue de volume

`npm run seed:volume` part du même jeu de démonstration et le complète jusqu'à **100 familles × 3 catégories × 50 sous-catégories × 350 produits**, soit 300 catégories, 15 000 sous-catégories et 5 250 000 produits et offres (5 photos chacun), répartis sur 104 boutiques.

- Les noms suivent les photos : un rayon « Ciments — gamme 7 » ne contient que des ciments. Les prix sont dérivés de ceux du catalogue réel.
- Le compte de démonstration, ses commandes et la vente flash sont conservés.
- Les quantités se règlent avec `SEED_FAMILLES`, `SEED_CATEGORIES_PAR_FAMILLE`, `SEED_SOUS_PAR_CATEGORIE` et `SEED_PRODUITS_PAR_SOUS`.
- Comptez environ 15 minutes et quelques Go sur disque. Le hasard est déterministe : deux lancements donnent les mêmes données.

À ce volume, `GET /familles` renvoie l'arbre complet (15 000 sous-catégories) et la recherche texte, en expression régulière, devient lente : c'est l'intérêt de ce jeu pour tester les performances.

Les données sont dans `src/seed/catalog.data.ts`. La construction des documents se fait dans `src/seed/build.ts` (sans base, couverte par des tests) et l'insertion dans `src/seed/index.ts`. Les photos sont générées depuis `Front/apk/design/` avec `bash design/render.sh --only-products`.

## Architecture

```
src/
├── index.ts              point d'entrée : middlewares, routes, arrêt propre
├── db/                   connexion MongoDB
├── models/               schémas Mongoose (soft delete via deletedAt)
├── controllers/          logique métier, transactions
├── routers/              routes Express + annotations Swagger
└── shared/
    ├── middlewares/      authentification, rôles, erreurs, quotas, validation
    ├── forms/            règles express-validator
    ├── interfaces/       mappers DTO (aucun document Mongoose exposé tel quel)
    ├── helpers/          upload de fichiers, templates d'emails
    ├── mail/             file d'envoi avec relances
    ├── logger/           Winston (console + logs/)
    └── BaseResponse/     enveloppe de réponse uniforme
```

Toutes les réponses suivent la même enveloppe :

```json
{ "success": true, "message": "Opération réussie", "statusCode": 200, "data": {} }
```

## Authentification

L'API s'appuie sur des **sessions serveur** : `POST /auth/login` pose un cookie
`btp.sid` (httpOnly, SameSite, `secure` en production) et l'identité reste en
base, dans la collection `sessions` (connect-mongo). Le client ne manipule
aucun jeton.

Le navigateur n'envoie ce cookie sur une requête cross-origin que si elle est
explicitement créditée :

```js
fetch("http://localhost:5000/api/v1/auth/me", { credentials: "include" });
```

L'origine du front doit figurer dans `CORS_ORIGINS`, sans quoi le cookie est
ignoré. Si front et API vivent sur des domaines distincts, il faut en plus
`COOKIE_SAME_SITE=none` et `COOKIE_SECURE=true` (donc HTTPS des deux côtés).

| Route | Effet sur la session |
| --- | --- |
| `POST /auth/login` | Ouvre la session (identifiant renouvelé : parade à la fixation) |
| `POST /auth/logout` | Ferme la session courante |
| `POST /auth/logout-all` | Ferme les sessions de tous les appareils |
| `PUT /auth/change-password` | Révoque les autres sessions, conserve celle en cours |
| `PUT /auth/reset-password/:token` | Révoque **toutes** les sessions du compte |

La session expire après `SESSION_TTL_DAYS` jours d'inactivité (7 par défaut) ;
chaque requête authentifiée repousse l'échéance.

Quatre types de compte (`EntityType`) : `user`, `shop`, `admin`, `user_societe`.

| Middleware | Rôle |
| --- | --- |
| `requireAuth` | Lit l'identité en session et renseigne `req.user` |
| `requireRole(...)` | Restreint aux types d'entités listés |
| `requireSelf(source, champ)` | Interdit d'accéder aux données d'un autre utilisateur (les admins sont exemptés) |

Règles appliquées :

- **Lecture publique** : catalogue (produits, boutiques, taxonomie), avis, promotions actives.
- **Utilisateur authentifié** : panier, favoris, commandes, adresses — uniquement les siens.
- **Admin / boutique** : création et modification du catalogue. Chaque boutique fait avancer ses propres sous-commandes ; l'administration tranche les litiges.
- **Boutique** : uniquement ses propres boutiques et leurs produits (`canManageShop`, `shared/helpers/shopAccess.ts`) — réglages, livraison, offres. `requireRole` ne vérifie que le type de compte.
- **Admin seul** : promotions, suppressions, examen des demandes d'ouverture de boutique.

## Demandes d'ouverture de boutique

Un client connecté demande l'ouverture d'une boutique en répondant à un
questionnaire ; l'administration l'approuve ou la refuse. Modèle :
`models/shopRequest.model.ts`, règles : `shared/forms/shopRequest.form.ts`.

| Route | Accès | Effet |
| --- | --- | --- |
| `POST /shop-requests` | `user`, `user_societe`, `shop` | Dépose une demande ; le demandeur est la session, jamais le corps |
| `GET /shop-requests/mine` | Authentifié | Ses demandes, la plus récente d'abord |
| `PATCH /shop-requests/:id/cancel` | Demandeur | Retire une demande en attente |
| `GET /shop-requests?status=&search=&page=&limit=` | Admin | `{ requests, total, page, totalPages, counts }` — en attente : les plus anciennes d'abord |
| `GET /shop-requests/:id` | Admin ou demandeur | Détail, avec le demandeur et les domaines |
| `PATCH /shop-requests/:id/approve` | Admin | Ouvre la boutique |
| `PATCH /shop-requests/:id/reject` `{ reason }` | Admin | Refus motivé (10 à 500 caractères) |

Le questionnaire : `nom`, `description` (20 à 1000 caractères), `familleIds`
(au moins un domaine actif), `sellerType` (`particulier` | `entreprise`),
`rccm` (exigé d'une entreprise seulement), `experience`, `catalogSize`,
`hasPhysicalStore`, `adresse`, `email` et `message` facultatifs, `acceptTerms`
obligatoire.

- **Une seule demande en attente par compte** : 409 côté contrôleur, et un
  index unique partiel (`status: "pending"`) tranche entre deux envois simultanés.
- **Nom unique** : une boutique existante du même nom (casse ignorée) refuse le
  dépôt comme l'approbation (409).
- **L'approbation**, dans une transaction : création de la boutique (`nom`,
  `description`, `adresse`, `email` de la demande ou du compte ; livraison par
  défaut), passage du compte au type `shop` dans `User` et `EntitiesLogin`,
  clôture de la demande (`reviewedBy`, `reviewedAt`, `shopId`). Ensuite,
  `updateUserSessionsRole` reporte le nouveau type dans les sessions ouvertes du
  demandeur : sans cela, `requireRole` lui refuserait l'espace vendeur jusqu'à
  sa prochaine connexion. Un compte admin garde son rôle.
- Un email part au dépôt, à l'approbation et au refus (motif compris, échappé).

## Livraison

Chaque boutique choisit ses modes par défaut ; chaque produit (offre `product_boutique`)
les hérite, ou a sa propre configuration.

| Mode | Frais |
| --- | --- |
| `pickup` — retrait en boutique | toujours 0, à l'adresse de la boutique |
| `free` — livraison gratuite | toujours 0 |
| `flat_rate` — livraison à prix fixe | tarif de la boutique ou du produit, obligatoire, entier > 0 |

Les montants sont des **entiers en GNF** (pas de subdivision, aucun flottant).
Les règles vivent dans `shared/helpers/delivery.helper.ts`, fonctions pures
couvertes par des tests ; le modèle dans `models/delivery.model.ts`.

### Boutique et produit

- `shop.delivery = { modes, flatRateFee }` : la référence par défaut. Une boutique
  doit garder au moins un mode ; le retrait exige une adresse, et `PUT /shops/:id`
  refuse d'effacer l'adresse tant qu'un retrait est proposé.
- `offer.delivery = { useShopSettings, modes, flatRateFee }` :
  - `useShopSettings: true` (défaut) — le produit **lit** les réglages courants de
    sa boutique à chaque calcul. Rien n'est recopié : modifier la boutique change
    aussitôt tous les produits qui héritent ;
  - `useShopSettings: false` — configuration propre, que la boutique n'écrase jamais.
    Les modes non retenus ne sont pas proposés pour ce produit.
- Les réponses produit exposent la livraison **effective** :
  `delivery: { source: "shop" | "product", modes, flatRateFee, options: [{ method, fee }] }`.

| Route | Effet |
| --- | --- |
| `GET /shops/:id/delivery` | Réglages, frais et portée (`inheritingProducts`, `customProducts`) — public |
| `PUT /shops/:id/delivery` `{ modes, flatRateFee? }` | Modifie les réglages — gérant ou admin |
| `POST / PUT /product-boutiques` champ `delivery` | `{ useShopSettings: true }` hérite ou revient à l'héritage ; `{ useShopSettings: false, modes, flatRateFee? }` personnalise. Absent : la création hérite, la modification ne change rien. En multipart, `delivery` est un JSON |
| `GET /product-boutiques/:id` | Livraison effective du produit |
| `POST /cart/:userId/delivery-quote` `{ deliveries?, deliveryMethod? }` | Modes et frais applicables au panier, sans écriture |

### Panier : une livraison par boutique

Les articles d'une même boutique partent ensemble : **une livraison par boutique**.

- ses modes sont ceux que **tous** ses articles acceptent ; s'il n'y en a aucun,
  le panier doit être scindé ;
- le prix fixe est facturé **une fois** par boutique, au tarif le plus élevé de
  ses articles (un produit encombrant impose son tarif au colis) ;
- deux boutiques font deux livraisons, donc deux frais ;
- le client choisit un mode par boutique (`deliveries: [{ boutiqueId, method }]`),
  ou un mode commun (`deliveryMethod`) ; un mode seul est retenu d'office.

Le devis et le checkout passent par le même calcul : le montant affiché est celui
qui sera facturé. **Aucun montant n'est lu dans la requête** ; un champ
`shippingFee` envoyé par le client est ignoré.

## Commandes

Une commande est un **instantané** : prix, noms de produits, adresse et
livraisons sont figés au moment du checkout et ne changent plus.

- `deliveries: [{ boutiqueId, boutiqueNom, method, fee, pickupAdresse? }]` — une
  entrée par boutique, lue dans la transaction du checkout. Les réglages modifiés
  ensuite ne touchent pas une commande validée.
- `deliveryMethod` résume : le mode commun, ou `mixed`.
- Les commandes antérieures gardent `standard` (25 000 GNF) ou `express`
  (50 000 GNF) et `deliveries: []` : lisibles, ces modes ne sont plus proposés.

`montant = sous-total − réduction + frais de livraison` (la réduction ne porte que sur les articles).

### Une sous-commande par boutique

Au checkout, la commande est découpée en **sous-commandes** (`ShopOrder`,
collection `shop_order`), une par boutique : ses articles, sa livraison, sa part
du coupon (au prorata, méthode du plus fort reste), son paiement, son code de
remise et son historique. Chaque boutique avance à son rythme ; le statut de la
commande se **déduit** de ses parties (`orderStatusFrom`) : `in_progress` tant
qu'une partie n'est pas finie, puis `completed`, `partially_completed` ou
`cancelled`.

Il n'existe pas de « changer le statut » libre : chaque étape est une **action**
nommée, permise à certains acteurs depuis certains statuts
(`shared/helpers/shopOrder.workflow.ts`). `availableActions` dans chaque DTO dit
quels boutons montrer à ce lecteur.

Parcours positif :

```
pending ─confirm→ confirmed ─ship→ shipped ──────────deliver→ delivered ─7 j→ completed
                      └─ready→ ready_for_pickup ─deliver─┘
```

Fins négatives :

```
pending            ─refuse→ refused   ─cancel→ cancelled   ─48 h→ expired
confirmed          ─refuse→ refused   ─cancel→ cancelled
ready_for_pickup   ─7 j→ expired
shipped            ─delivery-failed→ delivery_failed ─retry (2 tentatives)→ shipped
                                                     ─abandon→ failed
delivered          ─return→ return_requested ─accept-return→ returned
                                             ─reject-return ou 48 h→ disputed ─resolve-dispute→ returned | completed
```

L'administration peut annuler d'office (`admin-cancel`) toute sous-commande pas
encore livrée.

| Action | Qui | Depuis |
| --- | --- | --- |
| `confirm`, `refuse` (motif) | boutique | `pending` (`refuse` aussi depuis `confirmed`) |
| `ship` / `ready` | boutique | `confirmed` — `ready` pour un retrait en boutique |
| `deliver` (code de remise à 6 chiffres) | boutique | `shipped`, `ready_for_pickup` |
| `delivery-failed` (motif), `retry`, `abandon` | boutique | `shipped` / `delivery_failed` |
| `cancel` (motif facultatif) | client | `pending`, `confirmed` |
| `return` (motif, photos si abîmé) | client | `delivered`, dans les 7 jours |
| `accept-return`, `reject-return` (motif) | boutique | `return_requested` |
| `resolve-dispute` (remboursement total, partiel ou rejet) | admin | `disputed` |
| `admin-cancel` (motif) | admin | avant la livraison |
| `confirm-refund` | boutique, admin | remboursement à la remise en attente |

Le **code de remise** n'est lu que par le client ; la boutique le lui demande à la
remise. Le client ne voit pas les coordonnées d'autres clients, la boutique ne
voit pas le code.

**Fins négatives.** Le stock est rendu (sauf refus pour rupture : l'offre passe
à 0 ; et retour : la boutique juge si le produit est revendable). Payé en ligne,
le client est remboursé par le prestataire ; payé à la remise, la boutique
rembourse en reprenant le produit puis le confirme (`confirm-refund`). Un échec
de livraison causé par le client (absent, colis refusé — motif lu à l'échec)
ne rembourse pas les frais de livraison. Quand toute la commande échoue,
l'utilisation du coupon est rendue.

### Délais automatiques

Toutes les 15 minutes (`ORDER_SCHEDULER=off` pour couper sur une instance),
`runOrderDeadlines` applique les échéances avec les mêmes règles qu'une action :

| Statut | Échéance | Effet |
| --- | --- | --- |
| paiement en ligne en attente | 30 min | commande échouée, stock rendu, panier restauré |
| `pending` | 48 h (rappel à 24 h) | `expired`, client remboursé |
| `ready_for_pickup` | 7 j (rappel à 3 j) | `expired` |
| `delivered` | 7 j | `completed` |
| `return_requested` | 48 h (rappel à 24 h) | `disputed` |
| `shipped` | 7 j | alerte à l'administration, sans décision |

### Paiement

`paymentMethod` au checkout : `on_delivery` (par défaut, chaque boutique encaisse
à la remise) ou `online`. En ligne, la commande attend son paiement
(`awaiting_payment`) : stock réservé, sous-commandes invisibles des boutiques.
La réponse du checkout porte `payment.redirectUrl`, la page du prestataire.

- `PAYMENT_PROVIDER` choisit le prestataire ; hors production, le défaut est
  `sandbox`, un prestataire simulé dont la page est `APP_URL/paiement/:orderId`.
- `POST /payments/sandbox/:orderId { outcome: paid | failed }` joue le rôle de la
  notification signée d'un vrai prestataire (désactivé en production).
- `POST /payments/:orderId` relance le paiement d'une commande en attente.
- Un paiement confirmé après l'échec de la commande (délai dépassé) est
  remboursé aussitôt.

### Routes

| Route | Accès |
| --- | --- |
| `GET /shop-orders?boutiqueId=&group=&status=&search=&page=` | boutique (la sienne), admin — `counts` par onglet |
| `GET /shop-orders/:id` | client, boutique, admin |
| `PATCH /shop-orders/:id/:action` | selon l'action ; multipart (`photos`, 3 max) pour `return` |
| `GET /orders` | un client ne lit que ses commandes, quel que soit `userId` |

Les emails (nouvelle commande, confirmation, expédition avec le code, échec,
retour, litige, remboursement, rappels) partent après la transaction ; les
alertes de l'administration vont à `ADMIN_EMAIL`.

## Tests

1 270+ tests unitaires, exécutés sans base de données ni serveur : modèles Mongoose,
sessions de transaction, `express-validator`, `fs` et les emails sont simulés.

Voir [tests/README.md](tests/README.md) pour l'organisation et le guide d'ajout.

## Notes de migration

Deux renommages ont eu lieu ; si vous partez d'une base existante, appliquez :

```js
// Le champ mal orthographié amout devient amount
db.carts.updateMany({ amout: { $exists: true } }, { $rename: { amout: "amount" } })

// Le filtre de soft delete des produits utilisait deleteAt au lieu de deletedAt
db.products.updateMany({ deleteAt: { $exists: true } }, { $rename: { deleteAt: "deletedAt" } })
db.product_boutiques.updateMany({ deleteAt: { $exists: true } }, { $rename: { deleteAt: "deletedAt" } })
```

Les commandes existantes n'ont ni `shippingFee`, ni `deliveryMethod`, ni
`statusHistory` : les valeurs par défaut du schéma s'appliquent à la lecture.

### Sous-commandes

```bash
npm run migrate:shop-orders
```

Chaque commande sans sous-commande en reçoit une par boutique, avec ses articles,
sa livraison et sa part du coupon. Livrée devient `completed`, annulée reste
`cancelled`, le reste reprend son statut (une commande `pending` expirera 48 h
après la migration si la boutique ne la confirme pas). Idempotente ; le seed
l'applique à ses commandes de démonstration. La route
`PATCH /orders/:id/status` a disparu au profit des actions par sous-commande.

### Modes de livraison par boutique

```bash
npm run migrate:delivery
```

L'API fonctionne sans : les défauts des schémas s'appliquent à la lecture. La
migration écrit ces valeurs en base pour que les requêtes directes voient la
même chose que l'API. Idempotente, elle ne touche que les documents sans le champ
et ne modifie ni ne supprime rien d'existant :

| Documents | Valeur écrite |
| --- | --- |
| Boutiques avec adresse | `pickup` + `flat_rate` à 25 000 GNF — l'offre d'avant (retrait gratuit, livraison standard) |
| Boutiques sans adresse | `flat_rate` seul : le retrait exige une adresse |
| Offres | `useShopSettings: true` — elles héritent de leur boutique |
| Commandes | `deliveries: []` — leur mode et leurs frais d'origine sont conservés |
