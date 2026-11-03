import 'json.dart';
import 'shop.dart';
import 'taxonomy.dart';

// ─────────────────────────────────────────────
//  Produit et offre boutique — recopie de
//  Back/src/shared/interfaces/product.interfaces.ts.
//
//  L'identifiant d'une fiche est celui de l'offre (`ProductBoutique`), pas
//  du produit : c'est l'offre qui porte le prix, le stock et la boutique.
// ─────────────────────────────────────────────

class Product {
  const Product({
    required this.id,
    required this.name,
    this.description = '',
    this.urlImages = const [],
    this.familles = const [],
    this.categories = const [],
    this.sousCategories = const [],
  });

  final String id;
  final String name;
  final String description;
  final List<String> urlImages;
  final List<Famille> familles;
  final List<Categorie> categories;
  final List<SousCategorie> sousCategories;

  factory Product.fromJson(Json j) => Product(
        id: anyId(j),
        name: str(j, 'name'),
        description: str(j, 'description'),
        urlImages: strings(j, 'urlImages'),
        familles: objects(j, 'familles').map(Famille.fromJson).toList(),
        categories: objects(j, 'categories').map(Categorie.fromJson).toList(),
        sousCategories: objects(j, 'sousCategories').map(SousCategorie.fromJson).toList(),
      );
}

/// Prix par quantité : le prix d'une unité dès `minQuantity`.
class PriceTier {
  const PriceTier({required this.minQuantity, required this.percent, required this.unitPrice});

  final int minQuantity;
  final double percent;
  final double unitPrice;

  factory PriceTier.fromJson(Json j) => PriceTier(minQuantity: integer(j, 'minQuantity'), percent: number(j, 'percent'), unitPrice: number(j, 'unitPrice'));
}

/// La promotion qui fixe le prix du moment.
class PricingPromotion {
  const PricingPromotion({required this.id, required this.type, required this.label, this.flash = false, this.campaignId});

  final String id;
  final String type;
  final String label;
  final bool flash;
  final String? campaignId;

  factory PricingPromotion.fromJson(Json j) => PricingPromotion(id: str(j, 'id'), type: str(j, 'type'), label: str(j, 'label'), flash: boolean(j, 'flash'), campaignId: strOrNull(j, 'campaignId'));
}

/// Prix calculé par le serveur (moteur de prix du back) : le prix du moment,
/// le prix barré — le plus bas des 30 derniers jours, présent seulement à
/// partir de 5 % de remise —, la fin de la promotion et les paliers.
class OfferPricing {
  const OfferPricing({required this.basePrice, required this.price, this.referencePrice, this.percent, this.endsAt, this.promotion, this.tiers = const []});

  final double basePrice;
  final double price;
  final double? referencePrice;
  final double? percent;
  final DateTime? endsAt;
  final PricingPromotion? promotion;
  final List<PriceTier> tiers;

  factory OfferPricing.fromJson(Json j) {
    final promo = object(j, 'promotion');
    return OfferPricing(
      basePrice: number(j, 'basePrice'),
      price: number(j, 'price'),
      referencePrice: numOrNull(j, 'referencePrice'),
      percent: numOrNull(j, 'percent'),
      endsAt: DateTime.tryParse(str(j, 'endsAt')),
      promotion: promo == null ? null : PricingPromotion.fromJson(promo),
      tiers: objects(j, 'tiers').map(PriceTier.fromJson).toList(),
    );
  }
}

/// Place sponsorisée : un boost de la boutique la paie.
class Sponsored {
  const Sponsored({required this.boostId, required this.kind, required this.why});

  final String boostId;
  final String kind;

  /// « Pourquoi je vois ceci ? »
  final String why;

  factory Sponsored.fromJson(Json j) => Sponsored(boostId: str(j, 'boostId'), kind: str(j, 'kind'), why: str(j, 'why'));
}

class ProductBoutique {
  const ProductBoutique({
    required this.id,
    required this.productId,
    this.boutique,
    this.product,
    this.urlImages = const [],
    required this.price,
    this.discountPrice,
    this.pricing,
    this.featuredRank,
    this.sponsored,
    required this.stock,
    this.isFeatured = false,
    this.tags = const [],
    this.rating,
    this.reviewsCount,
    required this.createdAt,
  });

  final String id;
  final String productId;
  final Shop? boutique;
  final Product? product;
  final List<String> urlImages;
  final double price;

  /// Absent — et non nul — quand il n'y a pas de remise.
  final double? discountPrice;

  /// Calculé par le serveur ; absent seulement d'un DTO antérieur aux promotions.
  final OfferPricing? pricing;

  /// Produit phare de la vitrine (1 à 6).
  final int? featuredRank;

  /// Présent sur une place sponsorisée.
  final Sponsored? sponsored;
  final int stock;
  final bool isFeatured;
  final List<String> tags;
  final double? rating;
  final int? reviewsCount;
  final DateTime createdAt;

  factory ProductBoutique.fromJson(Json j) {
    final shop = object(j, 'boutique');
    final product = object(j, 'product');
    return ProductBoutique(
      id: anyId(j),
      productId: str(j, 'productId'),
      boutique: shop == null ? null : Shop.fromJson(shop),
      product: product == null ? null : Product.fromJson(product),
      urlImages: strings(j, 'urlImages'),
      price: number(j, 'price'),
      discountPrice: numOrNull(j, 'discountPrice'),
      pricing: object(j, 'pricing') == null ? null : OfferPricing.fromJson(object(j, 'pricing')!),
      featuredRank: j['featuredRank'] == null ? null : integer(j, 'featuredRank'),
      sponsored: object(j, 'sponsored') == null ? null : Sponsored.fromJson(object(j, 'sponsored')!),
      stock: integer(j, 'stock'),
      isFeatured: boolean(j, 'isFeatured'),
      tags: strings(j, 'tags'),
      rating: numOrNull(j, 'rating'),
      reviewsCount: j['reviewsCount'] == null ? null : integer(j, 'reviewsCount'),
      createdAt: DateTime.tryParse(str(j, 'createdAt')) ?? DateTime.now(),
    );
  }

  // ── Lectures des parties imbriquées ─────────
  String get name => product?.name ?? 'Produit';
  String get description => product?.description ?? '';
  String get shopName => boutique?.nom ?? 'Boutique';
  String? get image => urlImages.isNotEmpty ? urlImages.first : product?.urlImages.firstOrNull;
  Famille? get famille => product?.familles.firstOrNull;
  Categorie? get categorie => product?.categories.firstOrNull;
  SousCategorie? get sousCategorie => product?.sousCategories.firstOrNull;

  // ── Règles de prix et de stock ──────────────
  // Le prix vient du serveur (`pricing`) : l'application ne calcule aucune
  // remise. `discountPrice` ne sert qu'aux DTO d'avant le moteur de prix.
  bool get _legacyDiscount => discountPrice != null && discountPrice! < price;

  /// L'offre s'affiche « en promotion » : badge et prix barré.
  bool get hasDiscount => pricing != null ? (pricing!.percent ?? 0) > 0 : _legacyDiscount;

  /// Prix réellement payé pour une unité.
  double get effectivePrice => pricing?.price ?? (_legacyDiscount ? discountPrice! : price);

  /// Prix barré : le plus bas des 30 derniers jours, dès 5 % de remise.
  /// Un prix monté puis « barré » n'en montre donc aucun.
  double? get referencePrice => pricing != null ? pricing!.referencePrice : (_legacyDiscount ? price : null);

  /// Remise affichée, en pourcentage — jamais affichée si elle est nulle.
  int? get discountPercent {
    if (pricing != null) {
      final p = pricing!.percent;
      return p == null || p <= 0 ? null : p.round();
    }
    if (!_legacyDiscount || price <= 0) return null;
    final value = ((1 - effectivePrice / price) * 100).round();
    return value > 0 ? value : null;
  }

  /// Économie par rapport au prix barré.
  double get saving => (referencePrice ?? effectivePrice) - effectivePrice;

  /// Fin de la promotion en cours (un prix par quantité n'en a pas).
  DateTime? get promotionEnd {
    final end = pricing?.endsAt;
    return end != null && end.year < 9000 ? end : null;
  }

  bool get isFlashSale => pricing?.promotion?.flash ?? false;
  List<PriceTier> get tiers => pricing?.tiers ?? const [];

  /// Paliers qui font mieux que le prix du moment : pendant une vente flash
  /// plus forte, un palier n'apporte rien et ne s'affiche pas.
  List<PriceTier> get usefulTiers => [
    for (final t in tiers)
      if (t.unitPrice < effectivePrice) t,
  ];

  /// Prix d'une unité pour une quantité : le palier atteint, s'il est plus bas.
  double unitPriceFor(int quantity) => tiers.where((t) => quantity >= t.minQuantity).fold(effectivePrice, (lowest, t) => t.unitPrice < lowest ? t.unitPrice : lowest);
  bool get isOutOfStock => stock <= 0;
  bool get isLowStock => stock > 0 && stock <= 5;

  /// Offre de moins de 30 jours.
  bool get isNew => DateTime.now().difference(createdAt).inDays < 30;
}
