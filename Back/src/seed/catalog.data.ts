// ─────────────────────────────────────────────
//  Données du seed de développement — catalogue de démonstration.
//
//  Repris du jeu de démonstration du front (mêmes familles, boutiques,
//  produits, prix, promotions et commandes) : le back, le web et
//  l'application montrent le même catalogue. Les dates sont exprimées
//  relativement au lancement du seed, pour que le catalogue reste récent.
//  Chaque produit a 5 photos : uploads/seed/products/<image>-1..5.png.
// ─────────────────────────────────────────────

export const familles = [
  { key: "materiaux", nom: "Matériaux", description: "Tout pour la structure et la maçonnerie.", ordre: 1 },
  { key: "equipement", nom: "Équipement", description: "Outillage, sécurité et second œuvre.", ordre: 2 },
] as const;

/** `etape` : moment du chantier où l'on en a besoin (personnalisation « suite de votre chantier »). */
export const categories = [
  { key: "gros-oeuvre", famille: "materiaux", nom: "Gros œuvre", description: "Ciment, agrégats, fer à béton", ordre: 1, etape: "gros_oeuvre" },
  { key: "revetement", famille: "materiaux", nom: "Revêtement", description: "Carrelage, faïence, parquet", ordre: 2, etape: "revetements" },
  { key: "peinture", famille: "materiaux", nom: "Peinture", description: "Intérieur, façade, enduits", ordre: 3, etape: "finitions" },
  { key: "plomberie", famille: "equipement", nom: "Plomberie", description: "Tuyauterie, raccords, sanitaire", ordre: 4, etape: "reseaux" },
  { key: "electricite", famille: "equipement", nom: "Électricité", description: "Câbles, tableaux, appareillage", ordre: 5, etape: "reseaux" },
  { key: "outillage", famille: "equipement", nom: "Outillage", description: "Électroportatif et main", ordre: 6, etape: "transverse" },
] as const;

export const sousCategories = [
  { key: "liants", categorie: "gros-oeuvre", nom: "Liants", description: "Ciments et chaux", ordre: 1 },
  { key: "granulats", categorie: "gros-oeuvre", nom: "Granulats", description: "Sables et graviers", ordre: 2 },
  { key: "aciers", categorie: "gros-oeuvre", nom: "Aciers", description: "Ferraillage et treillis", ordre: 3 },
  { key: "blocs", categorie: "gros-oeuvre", nom: "Blocs", description: "Parpaings et briques", ordre: 4 },
  { key: "carrelage", categorie: "revetement", nom: "Carrelage et faïence", description: "Sol et mur", ordre: 1 },
  { key: "parquet", categorie: "revetement", nom: "Parquet", description: "Stratifié et massif", ordre: 2 },
  { key: "colles", categorie: "revetement", nom: "Colles et joints", description: "Pose et finition", ordre: 3 },
  { key: "peintures", categorie: "peinture", nom: "Peintures", description: "Intérieur et façade", ordre: 1 },
  { key: "enduits", categorie: "peinture", nom: "Enduits et sous-couches", description: "Préparation des supports", ordre: 2 },
  { key: "outils-peintre", categorie: "peinture", nom: "Outils de peintre", description: "Rouleaux, pinceaux, bacs", ordre: 3 },
  { key: "evacuation", categorie: "plomberie", nom: "Évacuation", description: "Tubes et raccords PVC", ordre: 1 },
  { key: "robinetterie", categorie: "plomberie", nom: "Robinetterie", description: "Mitigeurs et robinets", ordre: 2 },
  { key: "sanitaire", categorie: "plomberie", nom: "Sanitaire", description: "WC, lavabos, douches", ordre: 3 },
  { key: "eau-chaude", categorie: "plomberie", nom: "Eau chaude", description: "Chauffe-eau et ballons", ordre: 4 },
  { key: "cables", categorie: "electricite", nom: "Câbles et conducteurs", description: "Rigides et souples", ordre: 1 },
  { key: "protection", categorie: "electricite", nom: "Protection et tableaux", description: "Disjoncteurs et coffrets", ordre: 2 },
  { key: "appareillage", categorie: "electricite", nom: "Appareillage", description: "Prises et interrupteurs", ordre: 3 },
  { key: "eclairage", categorie: "electricite", nom: "Éclairage", description: "Projecteurs et luminaires", ordre: 4 },
  { key: "electroportatif", categorie: "outillage", nom: "Électroportatif", description: "Perceuses, meuleuses, scies", ordre: 1 },
  { key: "mesure", categorie: "outillage", nom: "Mesure et traçage", description: "Niveaux, lasers, mètres", ordre: 2 },
  { key: "materiel-chantier", categorie: "outillage", nom: "Matériel de chantier", description: "Manutention et accès", ordre: 3 },
  { key: "securite", categorie: "outillage", nom: "Sécurité", description: "EPI et signalisation", ordre: 4 },
] as const;

/**
 * Boutiques et leur gérant (compte « shop »). Le téléphone est stocké, jamais affiché par les fronts.
 * `delivery` : modes proposés par défaut à leurs produits (tarif du prix fixe en GNF).
 */
export const shops = [
  { key: "depot-matam", nom: "Dépôt Matam", description: "Gros œuvre en quantité : ciment, fer à béton, agrégats et parpaings, livrés sur chantier.", email: "contact@shop-depot-matam.gn", adresse: "Matam, Conakry", telephone: "622102030", delivery: { modes: ["pickup", "flat_rate"], flatRateFee: 50000 }, owner: { prenom: "Gérant", nom: "Dépôt Matam", email: "gerant.depot-matam@btp.com" } },
  { key: "kaloum-ceramique", nom: "Kaloum Céramique", description: "Carrelage, faïence et colles : grès cérame, finitions et conseils de pose.", email: "contact@shop-kaloum-ceramique.gn", adresse: "Kaloum, Conakry", telephone: "622112131", delivery: { modes: ["pickup", "flat_rate"], flatRateFee: 25000 }, owner: { prenom: "Gérant", nom: "Kaloum Céramique", email: "gerant.kaloum-ceramique@btp.com" } },
  { key: "coloris-conakry", nom: "Coloris Conakry", description: "Peintures intérieures et façades, enduits et outillage du peintre.", email: "contact@shop-coloris-conakry.gn", adresse: "Ratoma, Conakry", telephone: "622122232", delivery: { modes: ["pickup", "free"], flatRateFee: null }, owner: { prenom: "Gérant", nom: "Coloris Conakry", email: "gerant.coloris-conakry@btp.com" } },
  { key: "sanitaire-plus", nom: "Sanitaire Plus", description: "Plomberie et sanitaire : tuyauterie PVC, robinetterie, WC et chauffe-eau.", email: "contact@shop-sanitaire-plus.gn", adresse: "Matoto, Conakry", telephone: "622132333", delivery: { modes: ["pickup", "flat_rate"], flatRateFee: 30000 }, owner: { prenom: "Gérant", nom: "Sanitaire Plus", email: "gerant.sanitaire-plus@btp.com" } },
  { key: "volta-electrique", nom: "Volta Électrique", description: "Câbles, tableaux, disjoncteurs et appareillage pour le bâtiment.", email: "contact@shop-volta-electrique.gn", adresse: "Dixinn, Conakry", telephone: "622142434", delivery: { modes: ["pickup", "free", "flat_rate"], flatRateFee: 20000 }, owner: { prenom: "Gérant", nom: "Volta Électrique", email: "gerant.volta-electrique@btp.com" } },
  { key: "pro-outillage", nom: "Pro Outillage", description: "Outillage électroportatif, matériel de chantier et équipements de sécurité.", email: "contact@shop-pro-outillage.gn", adresse: "Matoto, Conakry", telephone: "622152535", delivery: { modes: ["pickup", "flat_rate"], flatRateFee: 35000 }, owner: { prenom: "Gérant", nom: "Pro Outillage", email: "gerant.pro-outillage@btp.com" } },
] as const;

/** Produits du catalogue ; `image` désigne leurs 5 photos dans uploads/seed/products. */
export const products = [
  { key: "ciment-cem2", name: "Ciment CEM II 42.5 — sac 50 kg", description: "Ciment Portland composé, prise rapide. Convient aux dalles, chapes et maçonnerie courante.", image: "ciment", famille: "materiaux", categorie: "gros-oeuvre", sousCategorie: "liants" },
  { key: "fer-ha12", name: "Fer à béton HA12 — barre 12 m", description: "Acier haute adhérence nuance FeE500, conforme aux normes de ferraillage.", image: "fer", famille: "materiaux", categorie: "gros-oeuvre", sousCategorie: "aciers" },
  { key: "carrelage-60", name: "Carrelage grès cérame 60×60", description: "Finition mate antidérapante, classe PEI IV. Vendu au carton de 4 dalles, 1,44 m².", image: "carrelage", famille: "materiaux", categorie: "revetement", sousCategorie: "carrelage" },
  { key: "peinture-facade", name: "Peinture façade acrylique — 20 L", description: "Hydrofuge et résistante aux UV, tenue renforcée en climat humide. Rendement 10 m²/L.", image: "peinture-facade", famille: "materiaux", categorie: "peinture", sousCategorie: "peintures" },
  { key: "tube-pvc-100", name: "Tube PVC évacuation Ø100 — 4 m", description: "Tube rigide NF pour eaux usées, assemblage par collage ou joint.", image: "tube-pvc", famille: "equipement", categorie: "plomberie", sousCategorie: "evacuation" },
  { key: "cable-25", name: "Câble rigide H07V-U 2.5 mm² — 100 m", description: "Conducteur cuivre pour circuits prises. Gaine PVC, couronne de 100 mètres.", image: "cable", famille: "equipement", categorie: "electricite", sousCategorie: "cables" },
  { key: "perforateur-sds", name: "Perforateur burineur SDS-Plus 850 W", description: "Trois modes, force de frappe 2,8 J. Livré en coffret avec jeu de forets.", image: "perforateur", famille: "equipement", categorie: "outillage", sousCategorie: "electroportatif" },
  { key: "brouette-90", name: "Brouette chantier 90 L — roue gonflable", description: "Caisse acier renforcée, châssis tubulaire. Charge utile 150 kg.", image: "brouette", famille: "equipement", categorie: "outillage", sousCategorie: "materiel-chantier" },
  { key: "enduit-lissage", name: "Enduit de lissage intérieur — 25 kg", description: "Poudre à gâcher pour finition murale, application manuelle ou mécanique.", image: "enduit", famille: "materiaux", categorie: "peinture", sousCategorie: "enduits" },
  { key: "gravier-15", name: "Gravier concassé 15/25 — tonne", description: "Granulat lavé pour béton et fondations. Livraison benne sur chantier.", image: "gravier", famille: "materiaux", categorie: "gros-oeuvre", sousCategorie: "granulats" },
  { key: "tableau-12", name: "Tableau électrique 12 modules pré-équipé", description: "Coffret avec disjoncteur de branchement et interrupteur différentiel 30 mA.", image: "tableau", famille: "equipement", categorie: "electricite", sousCategorie: "protection" },
  { key: "faience-25", name: "Faïence murale 25×40 — blanc mat", description: "Carreaux muraux pour cuisine et salle de bain. Carton de 1,5 m².", image: "faience", famille: "materiaux", categorie: "revetement", sousCategorie: "carrelage" },
  { key: "sable-lave", name: "Sable lavé 0/4 — tonne", description: "Sable de rivière lavé et criblé, pour mortier et enduit.", image: "sable", famille: "materiaux", categorie: "gros-oeuvre", sousCategorie: "granulats" },
  { key: "parpaing-15", name: "Parpaing creux 15×20×40 — palette de 60", description: "Bloc béton creux pour murs porteurs et cloisons.", image: "parpaing", famille: "materiaux", categorie: "gros-oeuvre", sousCategorie: "blocs" },
  { key: "treillis-soude", name: "Treillis soudé ST25C — panneau 6×2,4 m", description: "Armature pour dalles et planchers, maille 150×150 mm.", image: "treillis", famille: "materiaux", categorie: "gros-oeuvre", sousCategorie: "aciers" },
  { key: "colle-carrelage", name: "Colle à carrelage C2ET — 25 kg", description: "Mortier-colle amélioré, déformable, pour sol et mur.", image: "colle", famille: "materiaux", categorie: "revetement", sousCategorie: "colles" },
  { key: "plinthe-ceramique", name: "Plinthe céramique 8×60 — lot de 10", description: "Finition de sol assortie aux carrelages grès cérame.", image: "plinthe", famille: "materiaux", categorie: "revetement", sousCategorie: "carrelage" },
  { key: "parquet-stratifie", name: "Parquet stratifié chêne clair — 8 mm", description: "Lames clipsables classe 32, carton de 2,2 m².", image: "parquet", famille: "materiaux", categorie: "revetement", sousCategorie: "parquet" },
  { key: "peinture-interieur", name: "Peinture acrylique intérieure mate — 15 L", description: "Monocouche lessivable, faible odeur, blanc mat.", image: "peinture-interieure", famille: "materiaux", categorie: "peinture", sousCategorie: "peintures" },
  { key: "sous-couche", name: "Sous-couche universelle — 10 L", description: "Primaire d'accrochage pour supports poreux et plâtre.", image: "sous-couche", famille: "materiaux", categorie: "peinture", sousCategorie: "enduits" },
  { key: "rouleau-pinceau", name: "Kit rouleau et pinceaux — 8 pièces", description: "Manchons anti-gouttes, grille et bac de peintre inclus.", image: "kit-peintre", famille: "materiaux", categorie: "peinture", sousCategorie: "outils-peintre" },
  { key: "wc-suspendu", name: "Pack WC suspendu avec bâti-support", description: "Bâti autoportant, cuvette céramique et plaque de commande.", image: "wc", famille: "equipement", categorie: "plomberie", sousCategorie: "sanitaire" },
  { key: "mitigeur-lavabo", name: "Mitigeur lavabo chromé — cartouche céramique", description: "Économiseur d'eau intégré, flexibles de raccordement fournis.", image: "mitigeur", famille: "equipement", categorie: "plomberie", sousCategorie: "robinetterie" },
  { key: "chauffe-eau-100", name: "Chauffe-eau électrique 100 L", description: "Cuve émaillée, résistance stéatite, thermostat réglable.", image: "chauffe-eau", famille: "equipement", categorie: "plomberie", sousCategorie: "eau-chaude" },
  { key: "disjoncteur-20a", name: "Disjoncteur modulaire 20 A — lot de 5", description: "Courbe C, pouvoir de coupure 4,5 kA, montage sur rail DIN.", image: "disjoncteur", famille: "equipement", categorie: "electricite", sousCategorie: "protection" },
  { key: "prise-encastree", name: "Prise 2P+T encastrée — lot de 10", description: "16 A, obturateurs de sécurité, finition blanche.", image: "prise", famille: "equipement", categorie: "electricite", sousCategorie: "appareillage" },
  { key: "projecteur-led", name: "Projecteur LED chantier 50 W", description: "Étanche IP65, 4 500 lumens, support orientable.", image: "projecteur", famille: "equipement", categorie: "electricite", sousCategorie: "eclairage" },
  { key: "meuleuse-125", name: "Meuleuse d'angle 125 mm — 1 100 W", description: "Démarrage progressif, protection anti-redémarrage.", image: "meuleuse", famille: "equipement", categorie: "outillage", sousCategorie: "electroportatif" },
  { key: "niveau-laser", name: "Niveau laser croix automatique", description: "Portée 20 m, mise à niveau automatique, trépied inclus.", image: "niveau-laser", famille: "equipement", categorie: "outillage", sousCategorie: "mesure" },
  { key: "echafaudage-roulant", name: "Échafaudage roulant 4 m — acier", description: "Plateforme antidérapante, garde-corps et roues freinées.", image: "echafaudage", famille: "equipement", categorie: "outillage", sousCategorie: "materiel-chantier" },
  { key: "betonniere-160", name: "Bétonnière électrique 160 L", description: "Cuve acier, moteur 750 W, châssis renforcé sur roues.", image: "betonniere", famille: "equipement", categorie: "outillage", sousCategorie: "materiel-chantier" },
  { key: "casque-securite", name: "Casque de chantier + lot EPI", description: "Casque, gants, lunettes et gilet haute visibilité.", image: "casque", famille: "equipement", categorie: "outillage", sousCategorie: "securite" },
] as const;

/** Offres : un produit vendu par une boutique, avec son prix et son stock. */
/**
 * Offres. `delivery`, quand il est présent, remplace les réglages de la boutique :
 * granulats livrés en benne à tarif propre, échafaudage en retrait seulement.
 */
export const offers = [
  { key: "ciment-cem2", product: "ciment-cem2", shop: "depot-matam", price: 92000, discountPrice: 78000, stock: 340, isFeatured: true, tags: ["ciment", "maçonnerie"], rating: 4.7, reviewsCount: 312, daysAgo: 4.0 },
  { key: "fer-ha12", product: "fer-ha12", shop: "depot-matam", price: 145000, discountPrice: null, stock: 128, isFeatured: true, tags: ["acier", "ferraillage"], rating: 4.6, reviewsCount: 184, daysAgo: 9.0 },
  { key: "carrelage-60", product: "carrelage-60", shop: "kaloum-ceramique", price: 118000, discountPrice: 94500, stock: 76, isFeatured: true, tags: ["carrelage", "sol"], rating: 4.8, reviewsCount: 203, daysAgo: 2.0 },
  { key: "peinture-facade", product: "peinture-facade", shop: "coloris-conakry", price: 410000, discountPrice: 328000, stock: 42, isFeatured: true, tags: ["peinture", "façade"], rating: 4.5, reviewsCount: 97, daysAgo: 11.0 },
  { key: "tube-pvc-100", product: "tube-pvc-100", shop: "sanitaire-plus", price: 68000, discountPrice: null, stock: 210, isFeatured: false, tags: ["pvc", "évacuation"], rating: 4.4, reviewsCount: 58, daysAgo: 6.0 },
  { key: "cable-25", product: "cable-25", shop: "volta-electrique", price: 235000, discountPrice: 199000, stock: 64, isFeatured: true, tags: ["câble", "cuivre"], rating: 4.6, reviewsCount: 141, daysAgo: 3.0 },
  { key: "perforateur-sds", product: "perforateur-sds", shop: "pro-outillage", price: 1240000, discountPrice: 992000, stock: 18, isFeatured: true, tags: ["outillage", "électroportatif"], rating: 4.9, reviewsCount: 268, daysAgo: 1.0 },
  { key: "brouette-90", product: "brouette-90", shop: "pro-outillage", price: 385000, discountPrice: null, stock: 3, isFeatured: false, tags: ["chantier", "manutention"], rating: 4.3, reviewsCount: 74, daysAgo: 14.0 },
  { key: "enduit-lissage", product: "enduit-lissage", shop: "coloris-conakry", price: 96000, discountPrice: null, stock: 0, isFeatured: false, tags: ["enduit", "finition"], rating: 4.2, reviewsCount: 39, daysAgo: 21.0 },
  { key: "gravier-15", product: "gravier-15", shop: "depot-matam", price: 310000, discountPrice: null, stock: 95, isFeatured: false, tags: ["granulat", "béton"], rating: 4.5, reviewsCount: 112, delivery: { modes: ["flat_rate"], flatRateFee: 150000 }, daysAgo: 17.0 },
  { key: "tableau-12", product: "tableau-12", shop: "volta-electrique", price: 520000, discountPrice: 442000, stock: 27, isFeatured: false, tags: ["tableau", "sécurité"], rating: 4.7, reviewsCount: 88, daysAgo: 8.0 },
  { key: "faience-25", product: "faience-25", shop: "kaloum-ceramique", price: 74000, discountPrice: null, stock: 156, isFeatured: false, tags: ["faïence", "mur"], rating: 4.4, reviewsCount: 66, daysAgo: 5.0 },
  { key: "sable-lave", product: "sable-lave", shop: "depot-matam", price: 265000, discountPrice: null, stock: 140, isFeatured: false, tags: ["granulat", "mortier"], rating: 4.3, reviewsCount: 54, delivery: { modes: ["flat_rate"], flatRateFee: 150000 }, daysAgo: 46.0 },
  { key: "parpaing-15", product: "parpaing-15", shop: "depot-matam", price: 480000, discountPrice: 432000, stock: 58, isFeatured: false, tags: ["bloc", "maçonnerie"], rating: 4.5, reviewsCount: 129, daysAgo: 52.0 },
  { key: "treillis-soude", product: "treillis-soude", shop: "depot-matam", price: 198000, discountPrice: null, stock: 72, isFeatured: false, tags: ["acier", "dalle"], rating: 4.6, reviewsCount: 81, daysAgo: 38.0 },
  { key: "colle-carrelage", product: "colle-carrelage", shop: "kaloum-ceramique", price: 88000, discountPrice: null, stock: 184, isFeatured: false, tags: ["colle", "carrelage"], rating: 4.5, reviewsCount: 97, daysAgo: 41.0 },
  { key: "plinthe-ceramique", product: "plinthe-ceramique", shop: "kaloum-ceramique", price: 52000, discountPrice: null, stock: 96, isFeatured: false, tags: ["plinthe", "finition"], rating: 4.1, reviewsCount: 33, daysAgo: 60.0 },
  { key: "parquet-stratifie", product: "parquet-stratifie", shop: "kaloum-ceramique", price: 142000, discountPrice: 121000, stock: 64, isFeatured: false, tags: ["parquet", "sol"], rating: 4.4, reviewsCount: 71, daysAgo: 35.0 },
  { key: "peinture-interieur", product: "peinture-interieur", shop: "coloris-conakry", price: 268000, discountPrice: null, stock: 88, isFeatured: false, tags: ["peinture", "intérieur"], rating: 4.6, reviewsCount: 156, daysAgo: 44.0 },
  { key: "sous-couche", product: "sous-couche", shop: "coloris-conakry", price: 134000, discountPrice: null, stock: 52, isFeatured: false, tags: ["primaire", "préparation"], rating: 4.2, reviewsCount: 42, daysAgo: 57.0 },
  { key: "rouleau-pinceau", product: "rouleau-pinceau", shop: "coloris-conakry", price: 46000, discountPrice: 36800, stock: 210, isFeatured: false, tags: ["outil", "peinture"], rating: 4, reviewsCount: 118, daysAgo: 49.0 },
  { key: "wc-suspendu", product: "wc-suspendu", shop: "sanitaire-plus", price: 1480000, discountPrice: 1258000, stock: 12, isFeatured: false, tags: ["sanitaire", "wc"], rating: 4.7, reviewsCount: 64, daysAgo: 40.0 },
  { key: "mitigeur-lavabo", product: "mitigeur-lavabo", shop: "sanitaire-plus", price: 186000, discountPrice: null, stock: 78, isFeatured: false, tags: ["robinetterie", "lavabo"], rating: 4.3, reviewsCount: 89, daysAgo: 54.0 },
  { key: "chauffe-eau-100", product: "chauffe-eau-100", shop: "sanitaire-plus", price: 1950000, discountPrice: null, stock: 9, isFeatured: false, tags: ["chauffe-eau", "sanitaire"], rating: 4.5, reviewsCount: 47, daysAgo: 63.0 },
  { key: "disjoncteur-20a", product: "disjoncteur-20a", shop: "volta-electrique", price: 128000, discountPrice: null, stock: 134, isFeatured: false, tags: ["protection", "tableau"], rating: 4.6, reviewsCount: 102, daysAgo: 37.0 },
  { key: "prise-encastree", product: "prise-encastree", shop: "volta-electrique", price: 94000, discountPrice: 79900, stock: 176, isFeatured: false, tags: ["appareillage", "prise"], rating: 4.4, reviewsCount: 138, daysAgo: 43.0 },
  { key: "projecteur-led", product: "projecteur-led", shop: "volta-electrique", price: 172000, discountPrice: null, stock: 46, isFeatured: false, tags: ["éclairage", "chantier"], rating: 4.5, reviewsCount: 76, daysAgo: 48.0 },
  { key: "meuleuse-125", product: "meuleuse-125", shop: "pro-outillage", price: 620000, discountPrice: 527000, stock: 24, isFeatured: false, tags: ["outillage", "électroportatif"], rating: 4.6, reviewsCount: 192, daysAgo: 39.0 },
  { key: "niveau-laser", product: "niveau-laser", shop: "pro-outillage", price: 845000, discountPrice: null, stock: 15, isFeatured: false, tags: ["mesure", "laser"], rating: 4.8, reviewsCount: 143, daysAgo: 45.0 },
  { key: "echafaudage-roulant", product: "echafaudage-roulant", shop: "pro-outillage", price: 2340000, discountPrice: null, stock: 6, isFeatured: false, tags: ["chantier", "accès"], rating: 4.4, reviewsCount: 38, delivery: { modes: ["pickup"], flatRateFee: null }, daysAgo: 66.0 },
  { key: "betonniere-160", product: "betonniere-160", shop: "pro-outillage", price: 1780000, discountPrice: 1602000, stock: 11, isFeatured: false, tags: ["chantier", "béton"], rating: 4.7, reviewsCount: 121, daysAgo: 51.0 },
  { key: "casque-securite", product: "casque-securite", shop: "pro-outillage", price: 78000, discountPrice: null, stock: 240, isFeatured: false, tags: ["sécurité", "epi"], rating: 4.2, reviewsCount: 167, daysAgo: 58.0 },
] as const;

/** Promotions : la vente flash en cours et deux coupons. Dates en heures autour du lancement du seed. */
export const promotions = [
  { key: "flash-chantier", nom: "Déstockage chantier", description: "Jusqu'à 20 % sur une sélection de matériaux.", type: "flash_sale", scope: "product_boutique", discountType: "percentage", discountValue: 20, code: null, startsInHours: -24, durationHours: 72, offers: ["ciment-cem2", "carrelage-60", "peinture-facade", "cable-25", "perforateur-sds", "tableau-12", "parpaing-15", "parquet-stratifie", "rouleau-pinceau", "wc-suspendu", "prise-encastree", "meuleuse-125", "betonniere-160"], maxDiscount: null, minAmount: 0 },
  { key: "bienvenue", nom: "Bienvenue", description: "10 % sur votre première commande.", type: "coupon", scope: "cart", discountType: "percentage", discountValue: 10, code: "BIENVENUE10", startsInHours: -720, durationHours: 24 * 365, offers: [], maxDiscount: 100000, minAmount: 200000 },
  { key: "chantier", nom: "Remise chantier", description: "50 000 GNF dès 1 000 000 GNF d'achat.", type: "coupon", scope: "cart", discountType: "fixed", discountValue: 50000, code: "CHANTIER50", startsInHours: -48, durationHours: 24 * 30, offers: [], maxDiscount: null, minAmount: 1000000 },
] as const;

/** Compte client de démonstration (identifiants de développement uniquement). */
export const demoCustomer = { prenom: "Mamadou", nom: "Diallo", email: "mamadou@btp.com", telephone: "620000000" } as const;

/** Projet décrit par le client de démonstration à son inscription. */
export const demoProjet = { types: ["construction"], avancement: "gros_oeuvre" } as const;

export const demoAddresses = [
  { key: "maison", label: "Maison", destinataire: "Mamadou Diallo", telephone: "620000000", adresse: "Quartier Kipé, rue KA-028, villa 12", ville: "Conakry", commune: "Ratoma", isDefault: true },
  { key: "chantier", label: "Chantier Lambanyi", destinataire: "Chef de chantier — Ibrahima Sow", telephone: "621234567", adresse: "Lambanyi, derrière la station, parcelle 45", ville: "Conakry", commune: "Ratoma", isDefault: false },
] as const;

/**
 * Commandes de démonstration ; `history` en heures après la création.
 * pickup / free / flat_rate : livraison par boutique, frais calculés comme au checkout.
 * standard / express : commandes antérieures aux modes par boutique, gardées telles quelles.
 */
export const demoOrders = [
  { daysAgo: 1.0, status: "pending", deliveryMethod: "flat_rate", address: "chantier", items: [{"offer": "ciment-cem2", "price": 78000, "quantity": 40}, {"offer": "parpaing-15", "price": 432000, "quantity": 2}], history: [{"status": "pending", "afterHours": 2.0}] },
  { daysAgo: 4.0, status: "shipped", deliveryMethod: "standard", address: "maison", items: [{"offer": "carrelage-60", "price": 94500, "quantity": 12}, {"offer": "colle-carrelage", "price": 88000, "quantity": 6}, {"offer": "plinthe-ceramique", "price": 52000, "quantity": 3}], history: [{"status": "pending", "afterHours": 2.0}, {"status": "confirmed", "afterHours": 26.0}, {"status": "shipped", "afterHours": 74.0}] },
  { daysAgo: 9.0, status: "confirmed", deliveryMethod: "pickup", address: null, items: [{"offer": "perforateur-sds", "price": 992000, "quantity": 1}], history: [{"status": "pending", "afterHours": 2.0}, {"status": "confirmed", "afterHours": 2.0}] },
  { daysAgo: 21.0, status: "delivered", deliveryMethod: "standard", address: "maison", items: [{"offer": "peinture-facade", "price": 328000, "quantity": 4}, {"offer": "sous-couche", "price": 134000, "quantity": 2}, {"offer": "rouleau-pinceau", "price": 36800, "quantity": 1}], history: [{"status": "pending", "afterHours": 2.0}, {"status": "confirmed", "afterHours": 26.0}, {"status": "shipped", "afterHours": 50.0}, {"status": "delivered", "afterHours": 98.0}] },
  { daysAgo: 35.0, status: "cancelled", deliveryMethod: "express", address: "chantier", items: [{"offer": "gravier-15", "price": 310000, "quantity": 2}, {"offer": "sable-lave", "price": 265000, "quantity": 3}], history: [{"status": "pending", "afterHours": 2.0}, {"status": "cancelled", "afterHours": 26.0, "note": "Rupture de stock chez le dépôt."}] },
  { daysAgo: 60.0, status: "delivered", deliveryMethod: "standard", address: "maison", items: [{"offer": "cable-25", "price": 199000, "quantity": 1}, {"offer": "tableau-12", "price": 442000, "quantity": 1}, {"offer": "disjoncteur-20a", "price": 128000, "quantity": 5}], history: [{"status": "pending", "afterHours": 2.0}, {"status": "confirmed", "afterHours": 26.0}, {"status": "shipped", "afterHours": 50.0}, {"status": "delivered", "afterHours": 122.0}] },
] as const;
