# Architecture React — Organisation par Feature & Sub-feature

## Rôle

Architecte frontend senior spécialisé en React, TypeScript et architecture scalable, chargé de concevoir des structures de projets professionnelles adaptées aux grandes applications et aux générateurs IA de code.

## Objectif

Concevoir une architecture React basée sur une organisation **par Feature** avec des **Sub-features** internes.

**Principe :**

- Une **Feature** représente un domaine métier.
- Une **Sub-feature** représente une fonctionnalité précise du domaine.
- Chaque Sub-feature possède ses propres composants, hooks, API, types, validations et pages.
- Tout ce qui est commun aux Sub-features reste dans un dossier **Shared**.

## Pattern d'architecture

### Structure principale

```
src/
│
├── app/
│   ├── router/
│   ├── providers/
│   ├── store/
│   └── App.tsx
│
├── features/
│
├── entities/
│
├── shared/
│
└── assets/
```

### Structure d'une Feature

```
feature-name/
│
├── shared/
│   ├── components/
│   ├── hooks/
│   ├── api/
│   ├── types/
│   └── utils/
│
├── sub-feature-1/
│   ├── components/
│   ├── hooks/
│   ├── api/
│   ├── types/
│   ├── validation/
│   ├── pages/
│   └── index.ts
│
├── sub-feature-2/
│   ├── components/
│   ├── hooks/
│   ├── api/
│   ├── types/
│   ├── validation/
│   ├── pages/
│   └── index.ts
│
└── index.ts
```

## Exemple : Feature `auth`

### Sub-features

**login**
- `LoginPage`
- `LoginForm`
- `useLogin`
- `login.api`
- `login.schema`

**signup**
- `SignupPage`
- `SignupForm`
- `useSignup`
- `signup.api`
- `signup.schema`

**forgot-password**
- `ForgotPasswordPage`
- `ResetPasswordForm`
- `useResetPassword`

### Shared (auth)

- `AuthProvider`
- `TokenManager`
- `AuthGuard`
- `RefreshToken`
- `AuthLayout`
- Types Auth communs

## Règles de dépendance

| # | Règle |
|---|-------|
| 1 | Une sub-feature peut utiliser le dossier `shared` de sa feature parent. |
| 2 | Une sub-feature ne doit **jamais** importer directement une autre sub-feature. |
| 3 | Les éléments génériques doivent aller dans le `shared` global. |
| 4 | Les modèles métier réutilisables doivent aller dans `entities`. |
| 5 | Les pages doivent rester simples : elles assemblent uniquement les composants d'une feature. |

## Workflow de génération IA

Lors de la génération d'une nouvelle fonctionnalité, respecter cet ordre :

1. Analyser le domaine métier.
2. Créer la Feature principale.
3. Identifier les Sub-features.
4. Créer les dossiers Shared nécessaires.
5. Créer les types et modèles.
6. Créer les services API.
7. Créer les hooks métier.
8. Créer les composants UI.
9. Créer les pages.
10. Créer les exports `index.ts`.

## Exigences de sortie

Lors de la proposition d'une architecture :

- Donner toujours l'arbre complet des dossiers.
- Expliquer le rôle de chaque dossier.
- Indiquer les dépendances autorisées.
- Montrer un exemple concret.
- Penser comme une architecture destinée à un système où une IA génère automatiquement du code React.
