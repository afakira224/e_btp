# Images de l'application

Toutes les images sont dessinées en SVG, dans la palette Platinum Mist, puis converties en PNG avec Chrome sans interface. Il n'y a rien à installer.

| Source | Sortie | Usage |
|---|---|---|
| `svg/logo.svg`, `svg/logo_light.svg` | `assets/images/brand/` (1x, 2x, 3x) | Logo : version foncée, et version claire pour l'en-tête anthracite |
| `illustrations.py` | `assets/images/illustrations/` (1x, 2x, 3x) | Onboarding (catalogue, boutiques, livraison, suivi) et écran Bienvenue |
| `products.py` | `assets/images/products/` (480 px) | Photos des 32 produits du catalogue simulé |
| `svg/icon_legacy.svg` | `android/.../mipmap-*/ic_launcher.png` | Icône des Android d'avant la 8.0 |
| `svg/icon_ios.svg` | `ios/.../AppIcon.appiconset/` | Icônes iOS (toutes les tailles) |
| `svg/logo_light.svg` | `ios/.../LaunchImage.imageset/` | Logo de l'écran de lancement iOS |

L'icône adaptative Android et les écrans de lancement Android sont des vecteurs XML écrits à la main dans `android/app/src/main/res/drawable/`. Ils reprennent le même tracé de chariot que `svg/cart_path.txt`.

## Regénérer

Depuis `Front/apk` :

```bash
bash design/render.sh              # tout
bash design/render.sh --only-products
bash design/render.sh --native     # icônes et écrans de lancement natifs
```

Le logo reprend l'icône fournie, `assets/images/Minimalist Shopping Cart App Icon-Photoroom.png`, redessinée en vectoriel pour rester nette à toutes les tailles.
