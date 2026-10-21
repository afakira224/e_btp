# Charte graphique — Wolikhai Support
## Thème Platinum Mist

## 1. Identité visuelle

**Style :** sobre, professionnel, moderne, technologique.

La direction artistique repose principalement sur une palette monochrome inspirée de l'image **Platinum Mist**. La progression visuelle va du gris très clair vers l'anthracite :

`#F5F6F7 → #C1C4C8 → #7B7F85 → #2B2E33`

L'objectif est d'obtenir une interface élégante et discrète, adaptée à une plateforme de support, de litiges et de gestion de dossiers.

---

## 2. Palette principale

| Token | Couleur | HEX | Usage |
|---|---|---|---|
| Platinum 100 | Très clair | `#F5F6F7` | Fond principal |
| Platinum 300 | Gris clair | `#C1C4C8` | Bordures, séparateurs |
| Platinum 600 | Gris moyen | `#7B7F85` | Texte secondaire, éléments neutres |
| Platinum 900 | Anthracite | `#2B2E33` | Texte principal, navigation, éléments forts |

### Utilisation

**`#F5F6F7` — Platinum Light**
- Fond général
- Zone de contenu
- Arrière-plan des pages
- États neutres très légers

**`#C1C4C8` — Platinum Soft**
- Bordures
- Séparateurs
- Inputs
- Dividers
- États désactivés

**`#7B7F85` — Platinum Gray**
- Texte secondaire
- Icônes secondaires
- Labels
- Informations complémentaires
- Placeholder

**`#2B2E33` — Platinum Dark**
- Texte principal
- Header
- Sidebar
- Boutons principaux
- Éléments actifs
- Titres importants

---

## 3. Mode clair

Tous les composants doivent consommer des variables CSS sémantiques et non des couleurs hexadécimales directement.

```css
:root[data-theme="light"] {
  /* Platinum Mist */
  --color-primary: #2B2E33;
  --color-primary-text: #F5F6F7;

  --color-secondary: #7B7F85;
  --color-secondary-text: #F5F6F7;

  /* Neutres */
  --color-background: #F5F6F7;
  --color-surface: #F5F6F7;
  --color-surface-alt: #C1C4C8;

  --color-border: #C1C4C8;

  --color-text: #2B2E33;
  --color-text-muted: #7B7F85;

  /* Ombres */
  --shadow-card: 0 4px 12px rgba(43, 46, 51, 0.08);
}
```

---

## 4. Mode sombre

Le mode sombre conserve la même logique de tokens. Les couleurs neutres sont adaptées au fond sombre.

```css
:root[data-theme="dark"] {
  /* Platinum Mist */
  --color-primary: #F5F6F7;
  --color-primary-text: #2B2E33;

  --color-secondary: #7B7F85;
  --color-secondary-text: #F5F6F7;

  /* Neutres */
  --color-background: #2B2E33;
  --color-surface: #2B2E33;
  --color-surface-alt: #7B7F85;

  --color-border: #7B7F85;

  --color-text: #F5F6F7;
  --color-text-muted: #C1C4C8;

  /* Ombres */
  --shadow-card: 0 4px 12px rgba(0, 0, 0, 0.4);
}
```

---

## 5. Architecture visuelle

### Mode clair

```text
┌──────────────────────────────────────┐
│ HEADER                               │
│ #2B2E33                              │
├────────────┬─────────────────────────┤
│ SIDEBAR    │                         │
│ #2B2E33    │ CONTENT                 │
│            │ #F5F6F7                │
│            │                         │
│            │ ┌───────────────────┐   │
│            │ │ CARD              │   │
│            │ │ #F5F6F7           │   │
│            │ └───────────────────┘   │
└────────────┴─────────────────────────┘
```

### Mode sombre

```text
┌──────────────────────────────────────┐
│ HEADER                               │
│ #2B2E33                              │
├────────────┬─────────────────────────┤
│ SIDEBAR    │ CONTENT                 │
│ #2B2E33    │ #2B2E33                │
│            │                         │
│            │ ┌─────────────────────┐ │
│            │ │ CARD                │ │
│            │ │ #2B2E33             │ │
│            │ └─────────────────────┘ │
└────────────┴─────────────────────────┘
```

---

## 6. Boutons

### Primary

```css
background: var(--color-primary);
color: var(--color-primary-text);
```

Couleur principale : **Platinum Dark `#2B2E33`** en mode clair.

### Secondary

```css
background: transparent;
color: var(--color-text);
border: 1px solid var(--color-border);
```

### Ghost

```css
background: transparent;
color: var(--color-text-muted);
```

Au survol :

```css
background: var(--color-surface-alt);
color: var(--color-text);
```

---

## 7. Cards

Les cards doivent rester sobres.

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-card);
}
```

Éviter les grosses ombres et les gradients décoratifs. La hiérarchie visuelle doit principalement être créée avec :

- contraste ;
- espace ;
- typographie ;
- bordures ;
- différence entre les niveaux de gris.

---

## 8. Champs de formulaire

### Input

```css
background: var(--color-surface);
border: 1px solid var(--color-border);
color: var(--color-text);
```

### Placeholder

```css
color: var(--color-text-muted);
```

### Focus

```css
border-color: var(--color-primary);
```

---

## 9. Navigation

La navigation utilise le `#2B2E33` comme couleur forte.

### Sidebar

Dans les composants, utiliser les tokens :

```css
background: var(--color-primary);
color: var(--color-primary-text);
```

### Item actif

```css
background: var(--color-surface-alt);
color: var(--color-text);
```

### Item normal

```css
color: var(--color-text-muted);
```

---

## 10. États fonctionnels

La palette Platinum Mist est monochrome. Elle ne fournit donc pas de couleurs spécifiques pour les états fonctionnels.

Les couleurs fonctionnelles de la charte existante restent indépendantes de la palette Platinum Mist afin de conserver leur signification :

- **Success** → confirmation / réussite
- **Warning** → attention
- **Danger** → erreur / action critique

Ainsi :

- **Platinum Mist** → identité visuelle
- **Success / Warning / Danger** → information fonctionnelle

---

## 11. Statuts des litiges

Les statuts :

- `OPEN`
- `INVESTIGATION`
- `WAITING`
- `RESOLVED`

conservent leurs couleurs fonctionnelles définies dans la charte existante.

Ils doivent être testés pour garantir un contraste suffisant en mode sombre.

---

## 12. Border Radius

```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 16px;
```

| Élément | Radius |
|---|---:|
| Input | `6px` |
| Button | `6px` |
| Badge | `6px` |
| Card | `10px` |
| Modal | `16px` |
| Grande section | `16px` |

---

## 13. Règles générales du Design System

### À faire

- Utiliser uniquement les design tokens dans les composants.
- Supporter le mode clair et le mode sombre.
- Conserver la palette Platinum Mist comme identité visuelle principale.
- Utiliser les couleurs fonctionnelles uniquement pour leur signification.
- Vérifier le contraste WCAG AA.
- Garder une interface sobre et professionnelle.
- Utiliser les espaces et la typographie pour créer la hiérarchie.

### À éviter

- Coder des couleurs neutres directement dans les composants.
- Multiplier les couleurs décoratives.
- Utiliser des ombres trop fortes.
- Utiliser des gradients décoratifs sans nécessité.
- Concevoir uniquement pour le mode clair.
- Utiliser une couleur fonctionnelle uniquement comme élément décoratif.

---

## 14. Design Tokens JSON

```json
{
  "theme": "platinum-mist",
  "colors": {
    "platinum100": "#F5F6F7",
    "platinum300": "#C1C4C8",
    "platinum600": "#7B7F85",
    "platinum900": "#2B2E33"
  },
  "radius": {
    "sm": "6px",
    "md": "10px",
    "lg": "16px"
  }
}
```

---

## 15. Résumé visuel

```text
PLATINUM MIST

████████  #F5F6F7  Platinum 100
████████  #C1C4C8  Platinum 300
████████  #7B7F85  Platinum 600
████████  #2B2E33  Platinum 900
```

**Direction finale :**

> Minimaliste · Professionnelle · Monochrome · Moderne · Technologique · Sobre
