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
- un compte client `mamadou@btp.com` avec 2 adresses, 6 commandes (tous les statuts), des favoris et des produits récemment vus.

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
- **Admin / boutique** : création et modification du catalogue, changement de statut des commandes.
- **Boutique** : uniquement ses propres boutiques et leurs produits (`canManageShop`, `shared/helpers/shopAccess.ts`) — réglages, livraison, offres. `requireRole` ne vérifie que le type de compte.
- **Admin seul** : promotions, suppressions.

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

Le cycle de vie est un graphe orienté ; les sauts incohérents sont refusés :

```
pending ──→ confirmed ──→ shipped ──→ delivered
   │            │            │
   └────────────┴────────────┴──→ cancelled
```

Chaque transition est horodatée dans `statusHistory` avec son auteur et une note
facultative. L'annulation restitue le stock et l'utilisation du coupon.
Un email part à la création de la commande puis à chaque changement de statut.

## Tests

820+ tests unitaires, exécutés sans base de données ni serveur : modèles Mongoose,
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
