#!/usr/bin/env bash
# Rendu SVG -> PNG avec Chrome sans interface (aucune dépendance à installer).
#   render <fichier.svg> <sortie.png> <largeur> <hauteur> <échelle>
# Lancer depuis Front/apk : bash design/render.sh
set -euo pipefail
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
ROOT="$(cd "$(dirname "$0")/.." && pwd -W 2>/dev/null || pwd)"

render() {
  local src="$1" out="$2" w="$3" h="$4" scale="$5"
  mkdir -p "$(dirname "$out")"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --force-device-scale-factor="$scale" --window-size="$w,$h" --screenshot="$ROOT/$out" "file:///$ROOT/$src" >/dev/null 2>&1
}

# 1x / 2x / 3x pour les images à taille fixe dans l'app (Flutter choisit selon l'écran).
render_set() {
  local src="$1" dir="$2" name="$3" w="$4" h="$5"
  render "$src" "$dir/$name" "$w" "$h" 1
  render "$src" "$dir/2.0x/$name" "$w" "$h" 2
  render "$src" "$dir/3.0x/$name" "$w" "$h" 3
}

if [[ "${1:-}" == "--only-products" || "${1:-all}" == "all" ]]; then
  python design/products.py
  rm -f assets/images/products/*.png
  export -f render; export CHROME ROOT
  # 5 vues × 32 produits, rendues 6 à la fois.
  ls design/svg/products/*.svg | xargs -P 6 -I{} bash -c 'f="{}"; n="$(basename "$f" .svg)"; render "$f" "assets/images/products/$n.png" 200 200 2.4'
  # Mêmes images pour le seed du back, servies sous /uploads/seed/products/.
  BACK="$ROOT/../../Back/uploads/seed/products"
  mkdir -p "$BACK" && rm -f "$BACK"/*.png && cp assets/images/products/*.png "$BACK/"
  echo "$(ls assets/images/products | wc -l) photos produit"
fi
if [[ "${1:-}" == "--only-products" ]]; then exit 0; fi

# Marque
render_set design/svg/logo.svg assets/images/brand logo.png 100 100
render_set design/svg/logo_light.svg assets/images/brand logo_light.png 100 100
# Illustrations (onboarding, bienvenue)
(cd design && python illustrations.py)
for n in catalogue boutiques livraison suivi bienvenue; do
  [[ -f "design/svg/illustrations/$n.svg" ]] && render_set "design/svg/illustrations/$n.svg" assets/images/illustrations "$n.png" 320 240
done
echo "rendu terminé"

# ── Icônes et écrans de lancement natifs ─────
if [[ "${1:-all}" == "all" || "${1:-}" == "--native" ]]; then
  # Android (avant 8.0) : icône carrée arrondie ; à partir de 8.0, icône adaptative vectorielle.
  for pair in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
    d="${pair%%:*}"; px="${pair##*:}"
    render design/svg/icon_legacy.svg "android/app/src/main/res/mipmap-$d/ic_launcher.png" 100 100 "$(python -c "print($px/100)")"
  done
  # iOS : toutes les tailles de AppIcon.appiconset (iOS arrondit lui-même).
  python - <<'PY' > /tmp/ios_icons.txt
import json
c = json.load(open('ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json'))
seen = set()
for i in c['images']:
    px = float(i['size'].split('x')[0]) * float(i['scale'].rstrip('x'))
    if i['filename'] not in seen:
        seen.add(i['filename']); print(i['filename'], px / 100)
PY
  while read -r file scale; do
    render design/svg/icon_ios.svg "ios/Runner/Assets.xcassets/AppIcon.appiconset/$file" 100 100 "$scale"
  done < /tmp/ios_icons.txt
  # iOS : logo de l'écran de lancement (120 pt).
  render design/svg/logo_light.svg ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage.png 100 100 1.2
  render design/svg/logo_light.svg ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@2x.png 100 100 2.4
  render design/svg/logo_light.svg ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@3x.png 100 100 3.6
  echo "icônes natives rendues"
fi
