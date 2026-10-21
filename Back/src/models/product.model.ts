import mongoose, { type Document, Model, Schema, Types } from "mongoose";
import type { BaseModel } from "./baseModel.model.js";

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

export interface IProductBoutique extends Document , BaseModel{
    boutiqueId:Types.ObjectId,
    productId:Types.ObjectId,
    urlImages:string[],
    price:number,
    discountPrice?:number,
    stock:number,
    isFeatured:boolean,
    tags:string[],
    rating?:number,
    reviewsCount?:number
}

const productBoutiqeShema = new Schema<IProductBoutique>({
    boutiqueId:{type:Types.ObjectId , required:true, ref:"shop"},
    productId:{type:Types.ObjectId , required:true, ref:"product"},
    urlImages:{type:[String], default: []},
    price:{type:Number, required: true, min: 0},
    // Facultatifs : un produit peut être vendu sans remise et sans avis.
    discountPrice: {type:Number, min: 0, default: null},
    stock: {type:Number, required:true, min: 0, default: 0},
    isFeatured: {type:Boolean, default:false},
    tags: {type:[String], default: []},
    rating: {type:Number, min: 0, max: 5, default: 0},
    reviewsCount: {type:Number, min: 0, default: 0},
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

productBoutiqeShema.pre(/^find/,function(this: mongoose.Query<unknown,IProductBoutique>){
    this.where({deletedAt:null})
})

export const productBoutique : Model<IProductBoutique> = mongoose.model<IProductBoutique>("product_boutique",productBoutiqeShema)
