# BTP — Front web

Interface web React de la plateforme BTP.

## Démarrage

```bash
npm install
cp .env.example .env
npm run dev
```

Le serveur écoute sur **http://localhost:5174**, port figé (`strictPort`).
Le 5173 par défaut de Vite est occupé par le projet *Wolikhai Support* : sans
port figé, Vite glisserait silencieusement d'un port à l'autre à chaque
démarrage.

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement Vite (port 5174) |
| `npm run build` | `tsc -b` puis build de production dans `dist/` |
| `npm run preview` | Sert le build |
| `npm run lint` | oxlint |

## Données simulées

Le front tourne sur une **couche simulée** : ni serveur, ni base de données.
C'est le mode par défaut (`VITE_USE_MOCK=true`).

```
src/shared/api/
├── apiClient.ts       Aiguillage — expose l'un ou l'autre selon VITE_USE_MOCK
├── httpClient.ts      Client HTTP réel (fetch + credentials)
└── mock/
    ├── mockDb.ts      Documents `User` et `entities_login`, persistés en localStorage
    └── mockClient.ts  Un handler par route de l'API
```

Les deux implémentations exposent la même surface, renvoient la même enveloppe
`BaseResponse` et lèvent les mêmes `ApiError`. **Aucun code de feature ne sait
laquelle est active** : brancher la vraie API se fait en passant
`VITE_USE_MOCK=false`, sans toucher une ligne de code métier.

Les codes HTTP et les messages sont identiques à ceux du back : 401
identifiants invalides, 403 email non vérifié, 409 email déjà utilisé, 400
token expiré.

### Routes réellement exposées par le back

Le mock ne route que ce que le back monte, avec les mêmes paramètres :

| Route | Usage côté front |
| --- | --- |
| `GET /product-boutiques?boutiqueId=&productId=&isFeatured=` | Meilleures ventes, articles d'un dépôt, autres offres d'un produit |
| `GET /product-boutiques/search?q=&familleId=&categoryId=&sousCategoryId=&sort=&page=&limit=` | Listes par taxonomie, arrivages, fil de recommandations |
| `GET /product-boutiques/:id` | Fiche produit — alimente aussi l'historique |
| `GET /product-boutiques/:id/suggestions?limit=` | Produits similaires |
| `GET /product-boutiques/recently-viewed/:userId` | Récemment vus |
| `GET /shops/:id/delivery` · `PUT /shops/:id/delivery` | Livraison par défaut d'une boutique (espace vendeur) |
| `GET /products?search=` | Fiches du catalogue, pour créer une offre |
| `POST /product-boutiques` · `PUT /product-boutiques/:id` | Création et modification d'une offre (multipart) |
| `POST /cart/:userId/delivery-quote` | Modes et frais de livraison du panier |
| `POST /orders/:userId` | Checkout : un mode par boutique, adresse du carnet, mode de paiement |
| `GET /orders?status=` · `GET /orders/:id` | Mes commandes, avec leurs sous-commandes |
| `GET /shop-orders?boutiqueId=&group=&search=&page=` · `GET /shop-orders/:id` | Commandes d'une boutique (ou de toutes, pour l'administration), onglets et leurs comptes |
| `PATCH /shop-orders/:id/:action` | Les actions du cycle de vie (JSON, ou multipart avec photos pour un retour) |
| `POST /payments/:orderId` · `POST /payments/sandbox/:orderId` | Relance d'un paiement en ligne, issue du paiement simulé |
| `PUT /shops/:id` | Informations de la boutique et logo (multipart, espace vendeur) |
| `POST /shop-requests` · `GET /shop-requests/mine` · `PATCH /shop-requests/:id/cancel` | Demande d'ouverture de boutique, suivi, retrait |
| `GET /shop-requests?status=&search=&page=&limit=` · `GET /shop-requests/:id` | File d'examen de l'administration |
| `PATCH /shop-requests/:id/approve` · `PATCH /shop-requests/:id/reject` | Ouverture de la boutique, ou refus motivé |

Tris acceptés par `/search` : `newest`, `price_asc`, `price_desc`, `rating`,
`popular`.

**Le back n'a pas d'endpoint de recommandation personnalisée.** Le fil
« Produits que vous aimerez aussi » est le catalogue paginé trié par
popularité : le titre promet plus que la donnée ne tient, à revoir le jour où
un vrai moteur existe.

### Ce que le mock reproduit : les DTO, pas les modèles

Point important, et facile à rater : le mock renvoie les **DTO de réponse**
du back, pas ses documents Mongoose. Les deux formes diffèrent nettement.

| Modèle Mongoose | DTO de réponse |
| --- | --- |
| `_id` | `id` |
| `boutiqueId`, `productId` | `boutique` et `product` **imbriqués** |
| `familleId`, `categoryId`, `sousCategoryId` | `familles[]`, `categories[]`, `sousCategories[]` imbriqués |
| `discountPrice: null` | champ **absent** quand il n'y a pas de remise |

Les six DTO sont reproduits au champ près : `ProductBoutiqueResponseDto`,
`ProductResponseDto`, `ShopResponseDto`, `FamilleResponseDto`,
`CategorieResponseDto`, `SousCategorieResponseDto`.

Deux conséquences que la forme du DTO impose au front :

- `SousCategorieResponseDto` n'expose **aucun lien vers sa catégorie**. La
  page d'une sous-catégorie retrouve son parent en cherchant qui la contient
  dans l'arbre des domaines, pas en lisant un identifiant.
- `product` et `boutique` sont facultatifs. Les lecteurs `productName`,
  `shopName`, `categorieOf`… concentrent cette incertitude dans l'entité,
  plutôt que de disséminer des `?.` dans chaque composant.

Le côté authentification reprend en revanche les modèles : `User` (le profil)
et `entities_login` (les secrets) restent séparés, avec des identifiants au
format ObjectId.

### Compte de démonstration

| | |
| --- | --- |
| Email | `mamadou@btp.com` |
| Mot de passe | `Secret@123` |

Rappelé directement sur l'écran de connexion tant que le mode simulé est actif.
Un second compte, `aissatou@btp.com`, est volontairement **non vérifié** pour
éprouver le refus 403.

Le compte vendeur `gerant.volta-electrique@btp.com` (même mot de passe) gère la
boutique Volta Électrique et ouvre l'espace « Ma boutique ». Les commandes de
démonstration de `mamadou@btp.com` lui laissent une commande dans presque chaque
onglet (à confirmer, en préparation, livrée, retour demandé, terminée), et
l'administration y trouve un litige à trancher. Avec le vrai back,
`npm run seed` crée un gérant par boutique sur le même modèle
(`gerant.<boutique>@btp.com`).

Deux comptes servent le parcours d'ouverture de boutique (même mot de passe) :

| Compte | Rôle |
| --- | --- |
| `admin@btp.com` | Administration : examine les demandes, arrive sur `/admin` à la connexion |
| `ibrahima@btp.com` | Client dont la demande « Quincaillerie Kipé » attend l'examen |

Le compte `mamadou@btp.com` n'a déposé aucune demande : c'est lui qui permet
de suivre le parcours depuis le début.

En mode simulé, le catalogue de départ est figé dans `catalogSeed.ts` ; ce
qu'en font les vendeurs (réglages de livraison, prix, stock, offres ajoutées)
est rangé dans la base simulée et appliqué à la lecture par `liveCatalog.ts`.
Les règles de livraison (`deliveryRules.ts`) et celles du cycle de vie des
commandes (`shopOrderRules.ts`) sont des portages de celles du back, messages
compris. Les délais automatiques (expiration, clôture, litige) que le serveur
applique toutes les 15 minutes s'appliquent ici à chaque lecture, à la date de
leur échéance. Une base enregistrée avant les sous-commandes reçoit les siennes
à la lecture (`legacyOrders.ts`), comme avec `npm run migrate:shop-orders`. Les photos ajoutées en mode simulé sont des URL d'objet : elles
ne survivent pas à un rechargement.

Aucun email ne part : les liens de vérification et de réinitialisation sont
affichés à l'écran, dans un encart qui disparaît dès que le mode simulé est
coupé. La base se réinitialise en vidant la clé `btp.mock.db` du localStorage.

## Authentification

L'API authentifie **par session**, pas par jeton. Conséquences côté front :

- toutes les requêtes partent avec `credentials: "include"` (géré dans `shared/api/httpClient.ts`) ;
- le front ne stocke **aucun** jeton : l'identité vit dans le cookie `btp.sid`, httpOnly, illisible en JavaScript ;
- au démarrage, `AuthProvider` appelle `GET /auth/me` pour savoir si une session existe. Tant que la réponse n'est pas arrivée, le statut vaut `pending` et les gardes affichent un écran d'attente — sans cela un rafraîchissement de page éjecterait l'utilisateur connecté.

En mode simulé, `localStorage` tient lieu de cookie : la session survit au
rechargement de page, comme avec le vrai back.

Une fois branché sur l'API réelle, l'origine du front doit figurer dans
`CORS_ORIGINS`, sinon le navigateur refuse d'envoyer le cookie.

### Inscription

L'inscription publique ne crée que des comptes **`user`**. Le formulaire ne
propose aucun choix de rôle et `useSignup` impose `EntityType.USER` : un rôle
choisi par le client serait un rôle que n'importe qui peut réclamer. Un compte
devient **`shop`** quand l'administration approuve sa demande d'ouverture de
boutique (voir plus bas) ; les comptes société et administrateur passent par
une voie interne.

À la connexion, chacun arrive là où il travaille quand aucune page n'était
demandée : le gérant dans « Ma boutique », l'administration devant les
demandes à examiner, le client sur l'accueil. `useLogin` et `GuestGuard`
calculent cette destination avec la même fonction (`afterLoginPath`) : à la
connexion, les deux naviguent dans le même rendu, et une garde qui renvoyait
toujours vers `/` écrasait la page demandée.

### Écrans

| Route | Écran | Accès |
| --- | --- | --- |
| `/` | Accueil | Ouvert |
| `/login` | Connexion | Visiteur |
| `/signup` | Inscription + confirmation d'envoi d'email | Visiteur |
| `/forgot-password` | Demande de lien de réinitialisation | Visiteur |
| `/reset-password/:token` | Nouveau mot de passe | Visiteur |
| `/verify-email/:token` | Vérification d'email | Ouvert |
| `/categories` | Catalogue : tous les domaines, leurs catégories et sous-catégories | Ouvert |
| `/familles/:familleId` | Un domaine et ses produits | Ouvert |
| `/categories/:categorieId` | Produits d'une catégorie, filtrables par sous-catégorie | Ouvert |
| `/sous-categories/:sousCategorieId` | Produits d'une sous-catégorie | Ouvert |
| `/produits/:offreId` | Fiche produit | Ouvert |
| `/panier` | Panier | Authentifié |
| `/commande` | Tunnel de commande : livraison par boutique, adresse, paiement | Authentifié |
| `/paiement/:orderId` | Page du prestataire de paiement simulé | Authentifié |
| `/compte/commandes` · `/compte/commandes/:orderId` | Mes commandes ; détail boutique par boutique, avec code de remise, annulation et retour | Authentifié |
| `/favoris` | Favoris | Authentifié |
| `/compte` | Espace compte | Authentifié |
| `/compte/boutique/demande` | Questionnaire d'ouverture de boutique | Authentifié |
| `/compte/boutique` | Suivi de la demande : issue, réponses, historique | Authentifié |
| `/ma-boutique` | Espace vendeur : choix de la boutique (entrée directe s'il n'y en a qu'une) | Boutique, admin |
| `/ma-boutique/:boutiqueId/commandes` | Commandes de la boutique, par onglet (à confirmer, en préparation…) | Boutique, admin |
| `/ma-boutique/:boutiqueId/commandes/:partId` | Une commande : confirmer, expédier, remettre, répondre à un retour | Boutique, admin |
| `/ma-boutique/:boutiqueId/produits` | Produits de la boutique et provenance de leur livraison | Boutique, admin |
| `/ma-boutique/:boutiqueId/produits/nouveau` | Mise en vente d'un produit du catalogue | Boutique, admin |
| `/ma-boutique/:boutiqueId/produits/:offreId/modifier` | Modification d'un produit | Boutique, admin |
| `/ma-boutique/:boutiqueId/livraison` | Modes de livraison par défaut de la boutique | Boutique, admin |
| `/ma-boutique/:boutiqueId/informations` | Nom, présentation, email, adresse et logo de la boutique | Boutique, admin |
| `/admin/demandes-boutique` | File des demandes d'ouverture, par statut | Admin |
| `/admin/demandes-boutique/:requestId` | Examen d'une demande : approuver ou refuser | Admin |
| `/admin/commandes` · `/admin/commandes/:partId` | Commandes de toutes les boutiques, problèmes d'abord ; trancher un litige | Admin |

L'accueil est délibérément public : une vitrine derrière un mur
d'authentification empêche de découvrir le catalogue avant de s'inscrire.

## Page d'accueil

Sections : bandeau d'annonce, header collant, hero en carrousel, bande de
réassurance, catégories, nouveautés, meilleures ventes, promotions, pied de page.

### Carrousel du hero

Trois diapositives, chacune avec son angle **et sa propre sélection de
produits** — meilleures ventes, plus fortes remises, derniers arrivages.
Trois variations du même message n'auraient aucun intérêt : si l'utilisateur
attend le passage suivant, il doit y gagner quelque chose.

Le défilement automatique (6,5 s) s'arrête dans quatre cas :

| Cas | Pourquoi |
| --- | --- |
| `prefers-reduced-motion` | Réglage système de l'utilisateur, il prime |
| Pointeur sur le bloc | On est probablement en train de lire |
| Focus clavier à l'intérieur | Sinon la cible se dérobe sous les doigts |
| Onglet en arrière-plan | Inutile de défiler pour personne |

Accessibilité : `role="region"` + `aria-roledescription="carrousel"`, chaque
diapositive en `role="group"` annoncée « n sur 3 ». Les diapositives masquées
portent `inert` — sans quoi la tabulation emmène l'utilisateur sur des liens
hors écran. `aria-live` vaut `off` pendant le défilement automatique et
repasse à `polite` dès que l'utilisateur prend la main : annoncer une
diapositive toutes les six secondes rendrait la page inutilisable au lecteur
d'écran. Les flèches gauche/droite fonctionnent quand le focus est dans le
carrousel.

Les puces gardent une cible de 24 px de haut même si le trait n'en fait que 2.

### Navigation du catalogue

Quatre pages couvrent les trois niveaux de la taxonomie
(**famille → catégorie → sous-catégorie**), sous une ossature commune
`SiteLayout` : l'en-tête et le pied de page sont montés une fois, donc le menu
« Domaine » ne recharge pas ses familles à chaque navigation.

Les filtres de sous-catégorie sont de **vrais liens**, pas un état local : une
sélection reste partageable et revient avec le bouton Précédent.

Le fil d'Ariane remonte toujours la chaîne complète, même quand on arrive par
un lien direct sur une sous-catégorie — la page relit l'arbre des domaines
pour reconstituer les maillons manquants.

Un piège corrigé au passage : `useResource` ne se relançait qu'au montage.
Comme React Router ne démonte pas le composant quand seul un paramètre d'URL
change, passer d'une catégorie à l'autre affichait l'ancienne. Le hook prend
désormais une `key` — l'identifiant de ce qui est lu — et repasse en
chargement quand elle change, sinon la donnée périmée resterait à l'écran sans
rien pour signaler qu'elle ne correspond plus.

### Menu « Domaine »

L'entrée **Domaine** remplace l'ancienne « Catalogue » dans la navigation. Au
survol, elle déroule les familles du catalogue (`GET /familles`) avec leurs
catégories imbriquées — la même forme que renvoie `toFamilleResponseDto` côté
back.

C'est une **disclosure**, pas un `role="menu"`. Le rôle menu d'ARIA impose une
navigation aux flèches et une saisie rapide que personne n'attend d'un menu de
site, et qu'il faudrait alors implémenter en entier. Un bouton avec
`aria-expanded` qui dévoile une liste de liens est le motif juste.

Un menu au survol seul est inutilisable au clavier et au doigt. Celui-ci
répond à trois gestes et se referme de quatre façons :

| Geste | Effet |
| --- | --- |
| Survol | Ouvre — neutralisé si `(hover: hover)` ne correspond pas, c'est-à-dire sur écran tactile |
| Focus clavier | Ouvre |
| Clic / Entrée | Bascule |
| Sortie du survol | Ferme après **180 ms** |
| `Échap` | Ferme et rend le focus au déclencheur |
| Clic extérieur | Ferme |
| Clic sur un lien | Ferme |

Deux détails sans lesquels le menu serait pénible :

- **le délai de 180 ms** — en allant en diagonale du déclencheur vers le
  panneau, le pointeur sort une fraction de seconde de la zone ; sans délai le
  menu se referme et devient impossible à attraper ;
- **le pont invisible** (`.panel::before`) qui couvre l'espace entre l'entrée
  de menu et le panneau, pour la même raison.

Le panneau passe en `position: fixed` sous 1100 px. C'est exactement le seuil
où `.nav` devient une zone de défilement horizontal : un `overflow` sur un axe
rogne aussi l'autre, et un panneau en `absolute` y serait coupé. Les deux
seuils doivent rester alignés, sinon il reste une plage de largeurs où le menu
est invisible.

### Fiche produit

`/produits/:offreId` — l'identifiant est celui de l'**offre**
(`product_boutique`), pas du produit. C'est l'offre qui porte le prix, le
stock et la boutique : un même produit vendu par deux dépôts a deux fiches,
avec deux prix. Le modèle du back le permet, la route le reflète.

La page montre le fil d'Ariane complet sur six niveaux, la vignette, le prix
avec l'économie réalisée, l'état du stock, un sélecteur de quantité, la
description, les caractéristiques et les produits de la même sous-catégorie.

Les cartes produit du reste du site mènent à cette fiche. Le lien du titre
s'étend à toute la carte par un calque `::after`, ce qui évite d'imbriquer les
boutons « favoris » et « ajouter » dans une ancre — invalide en HTML, et
cassant au clavier.

### Sections de la fiche produit

Trois bandeaux sous la fiche, chacun adossé à une route réelle du back :

| Section | Route |
| --- | --- |
| Produits similaires | `GET /product-boutiques/:id/suggestions?limit=` |
| Autres articles du dépôt | `GET /product-boutiques?boutiqueId=&page=&limit=` |
| Récemment vus | `GET /product-boutiques/recently-viewed/:userId` |

Les suggestions appliquent la **cascade de pertinence du back** : même
sous-catégorie (score 3) > même catégorie (2) > même domaine (1), produit
courant exclu. Elle n'est pas réimplémentée côté front.

L'historique est **par utilisateur et protégé** (`requireAuth` + `requireSelf`).
Un visiteur anonyme n'en a pas, et la section disparaît — pas de repli sur un
historique local, qui serait une donnée que le serveur ne connaîtrait pas. Il
est alimenté à la consultation d'une fiche, dédupliqué et plafonné à 20,
comme `recordProductView`.

Une section vide ne s'affiche pas : un titre suivi de rien allonge la page
sans rien apprendre.

### Panier et favoris

Neuf routes, toutes protégées par `requireAuth` + `requireSelf` côté back —
l'identifiant utilisateur est dans l'URL, pas déduit de la session :

| Méthode | Route |
| --- | --- |
| `GET` | `/cart/:userId` |
| `POST` | `/cart/:userId/items` `{ productBoutiqueId, quantity? }` |
| `PUT` | `/cart/:userId/items/:productBoutiqueId` `{ quantity }` — **0 retire** |
| `DELETE` | `/cart/:userId/items/:productBoutiqueId` |
| `DELETE` | `/cart/:userId` |
| `GET` | `/wishlist/:userId` |
| `POST` | `/wishlist/:userId/items` `{ productBoutiqueId }` |
| `DELETE` | `/wishlist/:userId/items/:productBoutiqueId` |
| `DELETE` | `/wishlist/:userId` |

Chaque écriture renvoie la ressource complète : l'état local est remplacé,
jamais recalculé.

**Il n'y a pas de panier ni de favoris anonymes.** Le back répondrait 401, et
fabriquer un équivalent local créerait un conflit à la connexion. Le cœur
d'une vignette et le bouton d'ajout emmènent donc vers la connexion, en
gardant la page d'origine.

#### Deux formes différentes, volontairement

Les lignes de panier sont **aplaties** — `productName`, `urlImages` et `stock`
directement sur la ligne — tandis que les favoris **imbriquent l'offre
complète** (`productBoutique`). C'est ce que font les deux DTO du back, et la
page favoris peut donc réutiliser la vignette de catalogue telle quelle.

#### Le prix figé

`unitPrice` est le prix au moment de l'ajout ; `price` et `discountPrice` sont
les prix courants. Le DTO expose les trois, donc la page **signale l'écart**
plutôt que de laisser l'utilisateur le découvrir au paiement. Un réajout
rafraîchit le prix figé, une mise à jour de quantité ne le touche pas — c'est
le comportement du contrôleur.

Le stock insuffisant renvoie **400** (`Stock insuffisant (disponible : N)`),
pas 409.

#### Livraison au panier

Le récapitulatif affiche **une livraison par boutique**, avec les modes que tous
ses articles acceptent, issus de `POST /cart/:userId/delivery-quote`. Le front
n'envoie que les modes choisis : frais et total sont ceux du serveur, jamais
additionnés côté client. Le prix fixe est facturé une fois par boutique ; deux
boutiques font deux livraisons. Le devis est relu à chaque changement de quantité
ou de mode.

Le choix de mode vit dans le contexte du panier (`CartProvider`) : le client le
retrouve sur la page de commande, et un changement de compte l'efface.

#### Tunnel de commande

`/commande`, sur une seule page, en trois étapes puis une confirmation :

1. **Livraison** — le même choix par boutique que le panier.
2. **Adresse** — dès qu'une boutique livre, une adresse du carnet est requise ;
   l'adresse par défaut est présélectionnée. « Ajouter une adresse » ouvre le
   formulaire du compte, qui ramène ensuite à la commande (`state.returnTo`,
   chemins internes seulement). Si tout est retiré en boutique, aucune adresse
   n'est demandée : la page liste les adresses de retrait et propose un
   téléphone de contact, prérempli depuis le profil.
3. **Paiement** — à la livraison ou au retrait (par défaut : chaque boutique
   encaisse sa part à la remise), ou en ligne (tout, maintenant).

« Confirmer la commande » n'est actif que si le devis est complet, le stock
suffisant et l'adresse choisie quand elle est requise. Le front envoie à
`POST /orders/:userId` les modes (`deliveries`), l'adresse (`addressId`), le
téléphone éventuel et le mode de paiement — **aucun montant**. Le serveur
recalcule tout dans sa transaction ; s'il refuse (mode retiré entre-temps,
stock épuisé), l'erreur s'affiche et le devis comme le panier sont relus.

- **À la livraison** : le client arrive sur le détail de la commande, déjà
  transmise aux boutiques.
- **En ligne** : le client part sur la page du prestataire (`payment.redirectUrl`
  dans la réponse ; une adresse du site s'ouvre sans recharger l'application).
  Le prestataire simulé (`/paiement/:orderId`) propose « Payer » ou « Simuler un
  refus ». Payée, la commande part chez les boutiques ; refusée, ou sans
  paiement sous 30 minutes, elle est annulée et ses articles reviennent dans le
  panier. Une commande en attente se paie aussi depuis son détail.

Les coupons ne sont pas proposés dans le tunnel : le back les accepte (`code`),
le mode simulé ne les porte pas.

## Cycle de vie des commandes

Une commande est découpée en **une sous-commande par boutique**, chacune avec
son statut, ses délais, son code de remise et ses actions. Les règles vivent au
back (`shopOrder.workflow.ts`) ; le front n'affiche que les boutons que le
serveur renvoie dans `availableActions`, et chaque action ouvre sur place le
formulaire qu'elle demande (motif, code, photos, décision). Tout est dans la
feature `orders`, partagée par les trois places qui lisent une commande :

| Qui | Où | Ce qu'il fait |
| --- | --- | --- |
| Client | `/compte/commandes/:orderId` | Suit chaque boutique ; annule avant l'expédition ; donne son **code de remise** (affiché dès que le colis part ou est prêt) ; demande un retour dans les 7 jours (photo exigée pour un produit abîmé) |
| Boutique | `/ma-boutique/:id/commandes` | Onglets à confirmer · en préparation · en livraison · livrées · problèmes · terminées, avec leur compte et l'échéance de chaque commande ; confirme ou refuse (motif), expédie ou met à disposition, remet avec le code du client, signale un échec puis relivre (2 tentatives) ou abandonne, accepte ou refuse un retour, confirme un remboursement |
| Administration | `/admin/commandes` | Toutes les boutiques, l'onglet « Problèmes » d'abord ; tranche un litige (remboursement total, partiel ou rejet), confirme un remboursement, annule d'office |

Chaque attente a son échéance, annoncée avec ce qui arrive si personne ne fait
rien : 48 h pour confirmer (sinon expirée), 7 jours pour retirer, 7 jours pour
demander un retour (puis terminée), 48 h pour répondre à un retour (sinon
litige). Les montants remboursés suivent la règle du back : tout, sauf les frais
de livraison quand le client a causé l'échec de livraison.

## Ouverture d'une boutique

Un client connecté demande l'ouverture d'une boutique ; l'administration
l'approuve ou la refuse.

1. **Profil → « Ma boutique » → « Créer une boutique »** (aussi depuis « Vendre
   sur BTP » dans l'en-tête et la carte « Ouvrir une boutique » de « Mon
   compte »). Un visiteur passe par la connexion, qui le ramène au questionnaire.
2. **Le questionnaire**, en quatre parties : la boutique (nom, présentation,
   domaines du catalogue), l'activité (particulier ou entreprise, numéro RCCM
   exigé d'une entreprise seulement, ancienneté, taille du catalogue prévu), le
   retrait (point de vente, adresse, email de contact facultatif) et un message
   libre. L'acceptation des conditions de vente est obligatoire. Les règles et
   messages reprennent ceux de `createShopRequestForm` côté back.
3. **Le suivi** (`/compte/boutique`) : statut, réponses déposées, historique. Une
   demande en attente peut être retirée ; une seule demande en attente par
   compte, le formulaire renvoie vers le suivi s'il y en a déjà une.
4. **L'examen** (`/admin/demandes-boutique`) : file des demandes à examiner, les
   plus anciennes d'abord, onglets par statut avec leur nombre, recherche par
   nom. La page d'une demande montre les réponses et le contact du demandeur.
   Approuver et refuser se confirment sur place ; un refus exige un motif
   (10 à 500 caractères), envoyé au demandeur.
5. **L'approbation** crée la boutique avec les réponses (nom, présentation,
   adresse, email ou, à défaut, celui du compte) et fait passer le compte au
   type `shop`. Le back met aussi à jour les sessions ouvertes : le nouveau
   gérant n'a pas à se reconnecter. Côté front, `useMyShopRequests` relit le
   profil dès qu'il voit une demande approuvée, pour que l'espace vendeur
   s'ouvre sans rechargement.
6. **Un refus** reste visible dans le profil avec son motif ; « Faire une
   nouvelle demande » reprend les réponses précédentes comme brouillon.

Le téléphone de la boutique n'est ni demandé ni modifiable (voir
`entities/shop`) : l'administration recontacte le demandeur par le téléphone
de son compte.

## Espace vendeur « Ma boutique »

Réservé aux comptes `shop` et `admin` (`SellerGuard`), sous `AuthGuard`. On y
entre depuis « Mon compte ». Le back reste seul juge : il refuse toute écriture
sur la boutique d'un autre (`canManageShop`) ; le front se contente de ne pas
proposer de formulaire inutile.

- **Informations** : nom, présentation, email de contact, adresse et logo,
  envoyés en multipart à `PUT /shops/:id`. L'adresse ne peut pas être retirée
  tant que le retrait en boutique est proposé (refus du serveur, message
  affiché). L'en-tête de l'espace suit l'enregistrement sans rechargement, et
  « Voir ma vitrine » mène à la page publique de la boutique.
- **Livraison** : les trois modes — retrait en boutique, livraison gratuite,
  prix fixe — activables séparément ; le tarif n'apparaît qu'avec le prix fixe.
  À droite, la configuration appliquée et sa portée : combien de produits la
  suivent, combien sont personnalisés et ne bougeront pas.
- **Produit** : section « Modes de livraison » avec deux choix.
  « Utiliser les paramètres de la boutique » est le défaut : les modes hérités
  s'affichent en lecture seule, avec leur provenance. « Personnaliser la
  livraison de ce produit » ouvre l'éditeur, prérempli avec les réglages de la
  boutique. Revenir à la boutique abandonne la configuration propre à
  l'enregistrement.
- Les validations (au moins un mode, tarif entier > 0, adresse pour le retrait)
  reprennent celles du back, messages compris, pour éviter un aller-retour ; le
  serveur revalide tout.
- Le formulaire produit ne touche pas au prix remisé ni aux étiquettes : ces
  champs restent tels quels en modification.

### Listes en défilement infini

Les quatre listes de produits — recommandations de l'accueil, domaine,
catégorie, sous-catégorie — se chargent **page par page au défilement**, via
le même hook `useInfiniteProducts` et la même grille `InfiniteProductGrid`.
Une balise invisible posée sous la grille est observée par un
`IntersectionObserver` avec 500 px de marge d'anticipation : la page suivante
arrive avant que l'utilisateur n'atteigne le bas, il ne voit jamais de vide.

Les listes paginées du back renvoient `{ items, total, page, totalPages }` —
pas de `hasMore`, qui se déduit de `page < totalPages`.

Les pastilles de filtre **n'affichent pas de décompte par sous-catégorie** :
le back ne renvoie pas de facettes, et le déduire des produits déjà chargés
donnerait un chiffre faux tant que tout n'est pas descendu.

`key` identifie la liste lue. Quand elle change — on passe d'une catégorie à
l'autre — tout repart de zéro : sans cela les résultats de deux listes
différentes s'empileraient dans la même grille.

L'ordre est mélangé mais déterministe, calculé une seule fois. Un tri aléatoire
à chaque appel ferait réapparaître en page 2 des articles déjà vus en page 1, et
en escamoterait d'autres.

Trois garde-fous dans `useInfiniteProducts` :

| Garde | Rôle |
| --- | --- |
| `inFlight` | Empêche deux requêtes simultanées — l'observateur peut se déclencher deux fois avant la première réponse |
| `done` | Fige le fil dès que le serveur annonce la fin |
| `generation` | Invalide une requête périmée au démontage, **et libère `inFlight`** |

Ce dernier point n'est pas théorique : sans lui, le double montage du mode
strict fige la section sur ses blocs d'attente. Le nettoyage annule la première
requête, mais `inFlight` est encore levé quand le second montage appelle
`loadMore`, qui renonce — et plus personne ne charge.

Un bouton **« Charger plus »** double le défilement automatique au lieu de le
remplacer : au clavier, rien ne permet de « faire défiler pour charger ». Le fil
se termine par un état explicite plutôt que de s'arrêter en silence, et le pied
de page reste atteignable — c'est aussi pourquoi la section est placée avant les
bandeaux promotionnels et non en toute fin de page.

## Architecture

Organisation **par feature et sub-feature** (voir `architecture-react-feature-based.md`).

```
src/
├── app/                    Router, providers, composition racine
├── entities/                Modèles métier, miroirs de ceux du back
│   ├── user/
│   ├── product/            Product, ProductBoutique, CatalogItem, règles de prix
│   ├── delivery/           Modes de livraison, réglages, devis du panier
│   ├── order/              Commande, sous-commande : statuts, actions, motifs
│   ├── taxonomy/           Famille, Categorie, SousCategorie
│   └── promotion/          Promotion, compte à rebours
├── features/
│   ├── auth/
│   │   ├── shared/         AuthProvider, gardes, AuthLayout, règles de mot de passe
│   │   ├── login/          api · components · hooks · pages · validation
│   │   ├── signup/
│   │   ├── forgot-password/
│   │   └── verify-email/
│   ├── catalog/
│   │   ├── shared/         ProductCard, RatingStars, lectures du catalogue
│   │   ├── categories/
│   │   ├── new-arrivals/
│   │   ├── best-sellers/
│   │   ├── recommended/    Fil paginé, défilement infini
│   │   ├── domains/        Menu « Domaine » de la navigation
│   │   ├── product/        Fiche produit
│   │   └── browse/         Pages familles / catégorie / sous-catégorie
│   ├── cart/               Panier, choix de livraison par boutique, tunnel de commande, page de paiement
│   ├── orders/             Cycle de vie des commandes, partagé par le compte, la boutique et l'administration
│   │   └── shared/         API, bloc d'une sous-commande, actions, historique, tableau à onglets
│   ├── seller/             Espace « Ma boutique »
│   │   ├── shared/         API, garde, ossature, éditeur des modes, règles
│   │   ├── shops/          Choix de la boutique
│   │   ├── orders/         Commandes de la boutique
│   │   ├── delivery/       Livraison par défaut de la boutique
│   │   ├── products/       Liste, création et modification d'un produit
│   │   └── settings/       Informations et logo de la boutique
│   ├── shop-request/       Ouverture d'une boutique
│   │   ├── shared/         API, statut, résumé des réponses, paths
│   │   ├── apply/          Questionnaire et sa validation
│   │   └── status/         Suivi de la demande, panneau du profil
│   ├── admin/              Administration
│   │   ├── shared/         API, garde, en-tête, paths
│   │   ├── shop-requests/  File et examen des demandes de boutique
│   │   └── orders/         Commandes de toutes les boutiques, litiges
│   └── home/
│       ├── shared/         Section (en-tête, chargement, erreur)
│       ├── hero/           Carrousel : model · hooks · components
│       ├── promotions/
│       └── pages/          HomePage — assemble les sections
├── pages/                  Écrans hors feature (espace compte)
└── shared/                 api, config, hooks, layout, ui, styles
```

Règles de dépendance appliquées :

1. une sub-feature consomme le `shared` de sa feature, jamais une autre sub-feature ;
2. ce qui est générique remonte dans `src/shared` ;
3. les modèles métier réutilisables vivent dans `src/entities` ;
4. les pages assemblent des composants, sans logique ni appel réseau.

`Product` et `ProductBoutique` restent séparés comme dans le back : la fiche
générique d'un côté, l'offre d'une boutique de l'autre. `CatalogItem` est leur
vue jointe, telle qu'un endpoint de listing la renverrait — on compose les
modèles, on ne les fusionne pas.

### Écart assumé avec le document d'architecture

Le document cite `TokenManager` et `RefreshToken` dans `auth/shared`. Ces deux
briques sont propres à une authentification JWT. L'API ayant basculé en
sessions, elles n'ont pas d'objet : il n'y a pas de jeton à conserver ni à
rafraîchir. Elles sont remplacées par `AuthProvider` (état de session) et
`AuthGuard` / `GuestGuard` (contrôle d'accès aux routes).

## Design system

Thème **Platinum Mist** (voir `charte-graphique-btp-platinum-mist.md`).

### Parti pris

Une palette monochrome ne peut pas hiérarchiser par la couleur. Le §7 de la
charte le dit : la hiérarchie se construit avec **contraste, espace,
typographie et bordures**. Les écrans sont donc composés sur ce principe.

- **La typographie porte la page.** Inter pour l'interface, avec une échelle
  d'affichage en `clamp()` et un interlettrage resserré (`-0.035em`) sur les
  grandes tailles. IBM Plex Mono pour les mentions techniques : index de
  champs, surtitres, références, compteurs.
- **Pas de carte flottante sur les écrans d'auth.** Le formulaire se pose
  directement sur la surface, structuré par des filets d'un pixel. Les ombres
  portées sont réservées aux composants `Card` du reste de l'application.
- **Partition 42/58** plutôt que 50/50 : la symétrie parfaite fige la page,
  un léger déséquilibre donne la priorité au formulaire.
- **Trame de fond** sur la colonne d'identité, à 4,5 % d'opacité — évocation
  du papier millimétré, à la limite du visible.
- **Focus net** en trait intérieur plutôt qu'en halo diffus : un repère, pas
  une ombre.

### Tokens

- Tout est dans `src/shared/styles/tokens.css`. Aucun composant ne code une couleur en dur.
- Modes clair et sombre. Le thème suit le système tant que l'utilisateur n'a rien choisi ; son choix est mémorisé.
- Les surfaces de navigation (header, colonne de marque) utilisent `--color-nav*` et **restent anthracite dans les deux modes**, conformément aux schémas du §5. `--color-primary`, lui, s'inverse en mode sombre.
- Les couleurs fonctionnelles (success / warning / danger) restent hors palette : elles portent du sens, pas de l'identité. Elles sont éclaircies en mode sombre pour tenir le contraste AA.
- Les rayons suivent le §12 : 6px pour champs et boutons, 10px pour les cards.
