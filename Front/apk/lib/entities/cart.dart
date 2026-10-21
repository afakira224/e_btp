import 'json.dart';
import 'product.dart';

// ─────────────────────────────────────────────
//  Panier et favoris — recopies de Cart.interfaces.ts et
//  Wishlist.interfaces.ts. Les lignes de panier sont aplaties (nom, images,
//  stock) ; les favoris imbriquent l'offre complète.
// ─────────────────────────────────────────────

class CartItem {
  const CartItem({
    required this.productBoutiqueId,
    this.productName,
    this.urlImages = const [],
    required this.price,
    this.discountPrice,
    required this.unitPrice,
    required this.quantity,
    required this.stock,
    required this.lineTotal,
  });

  final String productBoutiqueId;
  final String? productName;
  final List<String> urlImages;

  /// Prix courant de l'offre, indicatif.
  final double price;
  final double? discountPrice;

  /// Prix unitaire figé au moment de l'ajout.
  final double unitPrice;
  final int quantity;
  final int stock;
  final double lineTotal;

  bool get exceedsStock => quantity > stock;
  bool get isOutOfStock => stock <= 0;

  factory CartItem.fromJson(Json j) => CartItem(
        productBoutiqueId: str(j, 'productBoutiqueId'),
        productName: strOrNull(j, 'productName'),
        urlImages: strings(j, 'urlImages'),
        price: number(j, 'price'),
        discountPrice: numOrNull(j, 'discountPrice'),
        unitPrice: number(j, 'unitPrice'),
        quantity: integer(j, 'quantity'),
        stock: integer(j, 'stock'),
        lineTotal: number(j, 'lineTotal'),
      );
}

class Cart {
  const Cart({this.items = const [], this.totalItems = 0, this.totalAmount = 0});

  static const empty = Cart();

  final List<CartItem> items;
  final int totalItems;
  final double totalAmount;

  bool get hasBlockingIssue => items.any((i) => i.isOutOfStock || i.exceedsStock);

  factory Cart.fromJson(Json j) => Cart(
        items: objects(j, 'items').map(CartItem.fromJson).toList(),
        totalItems: integer(j, 'totalItems'),
        totalAmount: number(j, 'totalAmount'),
      );
}

class WishlistItem {
  const WishlistItem({required this.productBoutiqueId, this.productBoutique});

  final String productBoutiqueId;

  /// Absente quand l'offre n'existe plus.
  final ProductBoutique? productBoutique;

  factory WishlistItem.fromJson(Json j) {
    final pb = object(j, 'productBoutique');
    return WishlistItem(
      productBoutiqueId: str(j, 'productBoutiqueId'),
      productBoutique: pb == null ? null : ProductBoutique.fromJson(pb),
    );
  }
}

class Wishlist {
  const Wishlist({this.items = const []});

  static const empty = Wishlist();

  final List<WishlistItem> items;

  int get count => items.length;
  bool has(String productBoutiqueId) => items.any((i) => i.productBoutiqueId == productBoutiqueId);
  List<ProductBoutique> get offers => items.map((i) => i.productBoutique).whereType<ProductBoutique>().toList();
  int get orphans => items.where((i) => i.productBoutique == null).length;

  factory Wishlist.fromJson(Json j) => Wishlist(items: objects(j, 'items').map(WishlistItem.fromJson).toList());
}
