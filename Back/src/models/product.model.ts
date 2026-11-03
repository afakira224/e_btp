import mongoose, { type Document, Model, Schema, Types } from "mongoose";
import type { BaseModel } from "./baseModel.model.js";
import { productDeliverySchema, type IProductDelivery } from "./delivery.model.js";

export interface IProduct extends Document, BaseModel {
    name: string;
    description: string;
    urlVideo?: string,
    urlImages: string[],
    familleId : Types.ObjectId,
    categoryId : Types.ObjectId,
    sousCategoryId : Types.ObjectId,
}
const productShema = new Schema<IProduct>({
    name: {type: String, required:true, trim:true},
    description: {type: String, required:true},
    urlVideo: {type: String},
    urlImages: {type: [String], required:true},
    familleId: {type: Types.ObjectId,required:true,ref:"famille"},
    categoryId: {type: Types.ObjectId,required:true,ref:"categorie"},
    sousCategoryId: {type: Types.ObjectId,required:true,ref:"sous-categorie"},
    deletedAt:   { type: Date, default: null },
},
{timestamps:true}
);

// Recherche plein texte sur le nom et la description.
productShema.index({ name: "text", description: "text" });
// Filtrage par taxonomie (pages catégorie / sous-catégorie).
productShema.index({ familleId: 1, categoryId: 1, sousCategoryId: 1 });
// Rayon seul (suggestions, filtre de recherche par catégorie ou sous-catégorie) :
// l'index composé ci-dessus commence par familleId et ne sert pas ici.
productShema.index({ categoryId: 1 });
productShema.index({ sousCategoryId: 1 });

productShema.pre(/^find/,function(this:mongoose.Query<unknown,IProduct>){
    this.where({deletedAt : null})
});

export const Product : Model<IProduct> = mongoose.model<IProduct>("product",productShema)


// Product Boutique

/**
 * Promotion appliquée à l'offre en ce moment. Calculée par le moteur de prix
 * (shared/services/pricing.service.ts) à chaque changement d'une promotion
 * ou du prix : jamais écrite par la boutique.
 */
export interface IOfferPromo {
    promotionId: Types.ObjectId;
    type: string;
    label: string;
    endsAt: Date;
    /** Prix barré : le plus bas prix pratiqué sur 30 jours, hors promotion. */
    referencePrice: number;
    /** Remise affichée par rapport au prix de référence ; 0 quand elle est sous 5 %. */
    percent: number;
    flash: boolean;
    campaignId?: Types.ObjectId | null;
}

export interface IQuantityTier {
    minQuantity: number;
    percent: number;
}

export interface IProductBoutique extends Document , BaseModel{
    boutiqueId:Types.ObjectId,
    productId:Types.ObjectId,
    urlImages:string[],
    price:number,
    /** Prix promotionnel en vigueur, calculé par le moteur de prix. */
    discountPrice?:number | null,
    promo?: IOfferPromo | null,
    quantityTiers: IQuantityTier[],
    /** Unités vendues et livrées sur 30 jours : le classement des meilleures ventes. */
    salesCount30d: number,
    /** Produit phare de la vitrine (1 à 6) ; null sinon. */
    featuredRank?: number | null,
    stock:number,
    isFeatured:boolean,
    tags:string[],
    rating?:number,
    reviewsCount?:number,
    delivery:IProductDelivery,
    /** Masquée par la modération : hors du catalogue, de la recherche et du panier. */
    hiddenAt?: Date | null,
    hiddenReason?: string | null
}

const productBoutiqeShema = new Schema<IProductBoutique>({
    boutiqueId:{type:Types.ObjectId , required:true, ref:"shop"},
    productId:{type:Types.ObjectId , required:true, ref:"product"},
    urlImages:{type:[String], default: []},
    price:{type:Number, required: true, min: 0},
    // Facultatifs : un produit peut être vendu sans remise et sans avis.
    discountPrice: {type:Number, min: 0, default: null},
    promo: {
        type: new Schema<IOfferPromo>({
            promotionId: { type: Types.ObjectId, ref: "promotion", required: true },
            type: { type: String, required: true },
            label: { type: String, required: true },
            endsAt: { type: Date, required: true },
            referencePrice: { type: Number, required: true, min: 0 },
            percent: { type: Number, min: 0, max: 100, default: 0 },
            flash: { type: Boolean, default: false },
            campaignId: { type: Types.ObjectId, ref: "campaign", default: null },
        }, { _id: false }),
        default: null,
    },
    quantityTiers: {
        type: [new Schema<IQuantityTier>({
            minQuantity: { type: Number, required: true, min: 2 },
            percent: { type: Number, required: true, min: 1, max: 70 },
        }, { _id: false })],
        default: [],
    },
    salesCount30d: {type:Number, min: 0, default: 0},
    featuredRank: {type:Number, min: 1, max: 6, default: null},
    stock: {type:Number, required:true, min: 0, default: 0},
    isFeatured: {type:Boolean, default:false},
    tags: {type:[String], default: []},
    rating: {type:Number, min: 0, max: 5, default: 0},
    reviewsCount: {type:Number, min: 0, default: 0},
    // Par défaut, l'offre suit les réglages de livraison de sa boutique ;
    // les offres antérieures à cette option héritent donc sans migration.
    delivery: { type: productDeliverySchema, default: () => ({}) },
    hiddenAt: { type: Date, default: null },
    hiddenReason: { type: String, default: null },
    deletedAt:   { type: Date, default: null },
},{timestamps:true})

// Un produit n'est référencé qu'une fois par boutique.
productBoutiqeShema.index({ boutiqueId: 1, productId: 1 }, { unique: true });
// Listing par boutique et mise en avant sur la page d'accueil.
productBoutiqeShema.index({ boutiqueId: 1 });
productBoutiqeShema.index({ productId: 1 });
productBoutiqeShema.index({ isFeatured: 1, createdAt: -1 });
// Tris de la recherche (newest, popular, price_asc/desc, rating) : sans index,
// MongoDB trierait toutes les offres à chaque page.
productBoutiqeShema.index({ createdAt: -1 });
productBoutiqeShema.index({ reviewsCount: -1 });
productBoutiqeShema.index({ price: 1 });
productBoutiqeShema.index({ rating: -1 });
// Meilleures ventes, offres en promotion, produits phares d'une vitrine.
productBoutiqeShema.index({ salesCount30d: -1 });
productBoutiqeShema.index({ "promo.percent": -1 });
productBoutiqeShema.index({ "promo.campaignId": 1 });
productBoutiqeShema.index({ boutiqueId: 1, featuredRank: 1 });

productBoutiqeShema.pre(/^find/,function(this: mongoose.Query<unknown,IProductBoutique>){
    this.where({deletedAt:null})
})

export const productBoutique : Model<IProductBoutique> = mongoose.model<IProductBoutique>("product_boutique",productBoutiqeShema)
