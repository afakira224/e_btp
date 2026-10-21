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
- **Admin seul** : promotions, suppressions.

## Commandes et livraison

Une commande est un **instantané** : prix, noms de produits et adresse sont figés
au moment du checkout et ne changent plus.

| Mode de livraison | Frais |
| --- | --- |
| `pickup` (retrait en boutique) | 0 GNF |
| `standard` | 25 000 GNF |
| `express` | 50 000 GNF |

`montant = sous-total − réduction + frais de livraison`

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

430+ tests unitaires, exécutés sans base de données ni serveur : modèles Mongoose,
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
