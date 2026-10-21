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

class ProductBoutique {
  const ProductBoutique({
    required this.id,
    required this.productId,
    this.boutique,
    this.product,
    this.urlImages = const [],
    required this.price,
    this.discountPrice,
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

  // ── Règles de prix et de stock (section 12) ──
  bool get hasDiscount => discountPrice != null && discountPrice! < price;

  /// Prix réellement payé : la remise l'emporte quand elle existe.
  double get effectivePrice => hasDiscount ? discountPrice! : price;

  /// Remise en pourcentage arrondi, jamais affichée si elle est nulle.
  int? get discountPercent {
    if (!hasDiscount || price <= 0) return null;
    final value = ((1 - effectivePrice / price) * 100).round();
    return value > 0 ? value : null;
  }

  double get saving => price - effectivePrice;
  bool get isOutOfStock => stock <= 0;
  bool get isLowStock => stock > 0 && stock <= 5;

  /// Offre de moins de 30 jours.
  bool get isNew => DateTime.now().difference(createdAt).inDays < 30;
}
