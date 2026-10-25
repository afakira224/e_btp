# Tests unitaires

Suite de tests unitaires du back-end, basée sur [Vitest](https://vitest.dev).

**Aucune base de données n'est requise.** Les modèles Mongoose, les sessions de
transaction, `express-validator` et le système de fichiers sont simulés : les tests
s'exécutent hors ligne, en quelques secondes.

## Commandes

| Commande | Effet |
| --- | --- |
| `npm test` | Lance toute la suite une fois |
| `npm run test:watch` | Mode interactif, relance à chaque modification |
| `npm run test:coverage` | Suite + rapport de couverture (`coverage/index.html`) |
| `npm run typecheck:tests` | Vérification des types de `src/` + `tests/` |

Cibler un fichier ou un test précis :

```bash
npx vitest run tests/unit/controllers/cart.controller.test.ts
npx vitest run -t "refuse un ajout dépassant le stock"
```

> `npm run typecheck:tests` compile `src/` et `tests/` ensemble : les deux doivent
> rester à zéro erreur.

## Organisation

```
tests/
├── setup.ts                     # mock global du logger Winston
├── helpers/
│   ├── express.mock.ts          # mockRequest / mockResponse / mockSession
│   ├── model.mock.ts            # mockModel / mockQuery (modèles Mongoose simulés)
│   ├── factories.ts             # fabriques de documents (makeCart, makeOrder, ...)
│   └── validation.ts            # exécution de ValidationChain sans serveur Express
└── unit/
    ├── controllers/             # contrôleurs : codes HTTP, règles métier, transactions
    ├── migrations/              # découpage des commandes existantes en sous-commandes
    └── shared/
        ├── BaseResponse.test.ts
        ├── middlewares/         # authentification, rôles, erreurs, validation
        ├── forms/               # règles express-validator
        ├── helpers/             # fileUpload (fs simulé), workflow des sous-commandes, transactions
        ├── interfaces/          # mappers DTO et calculs de promotion
        ├── payment/             # choix du prestataire de paiement
        └── services/            # actions sur les sous-commandes, paiement, délais, avis
```

## Périmètre couvert

**1 277 tests**.

| Domaine | Fichiers testés |
| --- | --- |
| Sécurité | `requireAuth`, `requireRole`, `requireSelf` |
| Erreurs | `errorHandler`, `notFoundHandler`, `asyncHandler`, `HttpError` |
| Réponses HTTP | `BaseResponse` |
| Mappers DTO | 100 % — panier, commande, avis, favoris, adresse, produit, boutique, taxonomie |
| Règles métier pures | `computePromotionDiscount`, `isPromotionActive` |
| Validation | formulaires panier, commande, avis, favoris, adresse, promotion |
| Fichiers | `fileUpload` (URL publique, suppression, limites de taille) |
| Contrôleurs | auth, panier, commande, sous-commande, paiement, promotion, avis, favoris, adresse, produit, produit-boutique, boutique, demande de boutique, famille, catégorie, sous-catégorie |
| Cycle de vie des commandes | règles des actions (`shopOrder.workflow`), effets (`shopOrder.service` : stock, remboursements, statut de la commande), paiement en ligne, délais automatiques, avis par email, migration des commandes existantes |

## Écrire un nouveau test de contrôleur

Le schéma est toujours le même : simuler les modèles, simuler `validationResult`,
espionner `mongoose.startSession`, puis appeler le contrôleur avec un faux couple
`req` / `res`.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";

// 1. Remplacer les modèles utilisés par le contrôleur
vi.mock("../../../src/models/cart.model.js", async () => {
  const { mockModel } = await import("../../helpers/model.mock.js");
  return { Cart: mockModel() };
});

// 2. Neutraliser la validation (testée séparément dans tests/unit/shared/forms)
vi.mock("express-validator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("express-validator")>();
  return {
    ...actual,
    validationResult: vi.fn(() => ({ isEmpty: () => true, array: () => [] })),
  };
});

import { Cart } from "../../../src/models/cart.model.js";
import { getCart } from "../../../src/controllers/cart.controller.js";
import { mockQuery } from "../../helpers/model.mock.js";
import { mockRequest, mockResponse, mockSession } from "../../helpers/express.mock.js";
import { makeCart } from "../../helpers/factories.js";

const CartMock = Cart as unknown as Record<string, any>;
let session: ReturnType<typeof mockSession>;

beforeEach(() => {
  session = mockSession();
  // 3. Toute transaction ouverte par le contrôleur devient espionnable
  vi.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
});

it("renvoie le panier", async () => {
  CartMock.findOne.mockReturnValue(mockQuery(makeCart()));
  const res = mockResponse();

  await getCart(mockRequest({ params: { userId: "..." } }), res);

  expect(res.statusCode).toBe(200);
});
```

### Points d'attention

- `mockQuery(valeur)` rend `Model.findOne(...).session(s).sort(...)` chaînable et
  « awaitable ». C'est ce qu'attendent les contrôleurs.
- `mockModel()` sert aussi de constructeur : `new Cart({...})` génère un `_id` et un
  `save()` espionnable, comme le ferait Mongoose.
- `Model.create([...], { session })` renvoie par défaut les objets bruts passés en
  argument. S'il faut un document complet (avec `_id`), surcharger :
  `AddressMock.create.mockImplementation(async (docs) => [makeAddress(docs[0])])`.
- Les objets passés aux mocks sont mutés par les contrôleurs. Pour vérifier un
  argument d'appel, inspecter `mock.calls[0][0]` immédiatement, ou assertionner sur
  l'état final du document plutôt que sur l'argument.
- Quand un modèle exporte aussi des enums ou des constantes (`OrderStatus`,
  `DeliveryMethod`, `DELIVERY_FEES`...), il faut les conserver dans le mock :
  `return { ...actual, Order: mockModel() }`. Sinon le contrôleur reçoit `undefined`.
- Le logger Winston est mocké globalement dans `setup.ts` : pas de bruit en console,
  pas de dossier `logs/` créé pendant les tests.
- Les emails sont simulés (`vi.mock` sur `mail.helper.js`) : on vérifie l'appel et son
  contenu, jamais l'envoi réel.
