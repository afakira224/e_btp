import { Product, type IProductBoutique } from "../../models/product.model.js";
import { Shop } from "../../models/boutique.model.js";
import { Famille } from "../../models/famille.model.js";
import { Categorie } from "../../models/categorie.model.js";
import { SousCategorie } from "../../models/sousCategorie.model.js";
import { toProductBoutiqueResponseDto, type ProductBoutiqueResponseDto } from "../interfaces/product.interfaces.js";

// ─────────────────────────────────────────────
//  Mise en forme d'une liste d'offres : boutique, produit et taxonomie
//  chargés en un aller-retour par collection. Partagé par les listes
//  d'offres, les suggestions et les recommandations.
// ─────────────────────────────────────────────
export const enrichProductBoutiques = async (
  items: IProductBoutique[]
): Promise<ProductBoutiqueResponseDto[]> => {
  const shopIds = [...new Set(items.map(i => i.boutiqueId?.toString()).filter(Boolean))];
  const productIds = [...new Set(items.map(i => i.productId?.toString()).filter(Boolean))];

  const [shops, products] = await Promise.all([
    Shop.find({ _id: { $in: shopIds } }),
    Product.find({ _id: { $in: productIds } }),
  ]);

  const familleIds = [...new Set(products.map(p => p.familleId?.toString()).filter(Boolean))];
  const categoryIds = [...new Set(products.map(p => p.categoryId?.toString()).filter(Boolean))];
  const sousCategoryIds = [...new Set(products.map(p => p.sousCategoryId?.toString()).filter(Boolean))];

  const [familles, categories, sousCategories] = await Promise.all([
    Famille.find({ _id: { $in: familleIds } }),
    Categorie.find({ _id: { $in: categoryIds } }),
    SousCategorie.find({ _id: { $in: sousCategoryIds } }),
  ]);

  return items.map(item => {
    const shop = item.boutiqueId
      ? shops.find(s => s._id.toString() === item.boutiqueId.toString())
      : undefined;
    const product = item.productId
      ? products.find(p => p._id.toString() === item.productId.toString())
      : undefined;
    return toProductBoutiqueResponseDto(item, shop ?? undefined, product ?? undefined, familles, categories, sousCategories);
  });
};

