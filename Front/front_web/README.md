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
choisi par le client serait un rôle que n'importe qui peut réclamer. Les
comptes boutique, société et administrateur passent par une voie interne.

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
| `/favoris` | Favoris | Authentifié |
| `/compte` | Espace compte | Authentifié |

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
│   ├── cart/               Panier minimal (compte + ajout)
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
