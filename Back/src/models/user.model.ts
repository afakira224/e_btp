import mongoose, { Document, Model, Schema, Types } from "mongoose";
import bcrypt from "bcryptjs";
import { projetSchema, type IProjet } from "./projet.model.js";

// ─────────────────────────────────────────────
//  USER
// ─────────────────────────────────────────────
export interface IUser extends Document {
  nom: string;
  prenom: string;
  email: string;
  telephone?: string; 
  avatar?: string | null;
  role: EntityType;
  isEmailVerified: boolean;
  /** Projet déclaré à l'inscription ou dans le profil ; null s'il n'a rien dit. */
  projet?: IProjet | null;
}

// ─────────────────────────────────────────────
//  TYPES D'ENTITÉS
// ─────────────────────────────────────────────
export enum EntityType {
  USER         = "user",
  SHOP         = "shop",
  ADMIN        = "admin",
  USER_SOCIETE = "user_societe",
}

const userSchema = new Schema<IUser>(
  {
    nom:       { type: String, required: true, trim: true },
    prenom:    { type: String, required: true, trim: true },
    email:     { type: String, required: true, trim: true, lowercase: true },
    telephone: { type: String, trim: true },
    avatar:    { type: String, default: null },
    role:      { type: String, enum: Object.values(EntityType), default: EntityType.USER },
    isEmailVerified: { type: Boolean, default: false },
    projet:    { type: projetSchema, default: null },
  },
  { timestamps: true }
);

// Le mot de passe n'est jamais porté par User (il vit sur EntitiesLogin) :
// aucun nettoyage n'est nécessaire ici.

// Un email identifie un compte de façon unique.
userSchema.index({ email: 1 }, { unique: true });

export const User: Model<IUser> = mongoose.model<IUser>("user", userSchema);

// ─────────────────────────────────────────────
//  ENTITIES LOGIN
//  Porte les secrets du compte (mot de passe, tokens email).
//  Les sessions vivent dans la collection "sessions" (connect-mongo).
// ─────────────────────────────────────────────
export interface IUserLogin extends Document {
  entityId: Types.ObjectId;
  email: string;
  password: string;
  entityType: EntityType;
  emailVerifyToken: string | null;
  resetPasswordToken: string | null;
  resetPasswordExpires: Date | null;
  comparePassword(plain: string): Promise<boolean>;
}

const userLoginSchema = new Schema<IUserLogin>(
  {
    entityId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "user", 
      required: true 
    },
    email: { 
      type: String, 
      required: true, 
      unique: true, 
      lowercase: true, 
      trim: true 
    },
    password: { 
      type: String, 
      required: true, 
      minlength: 8 
    },
    entityType: { 
      type: String, 
      enum: Object.values(EntityType), 
      required: true 
    },
    emailVerifyToken: { 
      type: String, 
      default: null 
    },
    resetPasswordToken: { 
      type: String, 
      default: null 
    },
    resetPasswordExpires: { 
      type: Date, 
      default: null 
    }
  },
  { timestamps: true }
);

userLoginSchema.pre("save", async function() {
  if (!this.isModified("password")) {
    return;
  }
  this.password = await bcrypt.hash(this.password, 12);
});

userLoginSchema.methods.comparePassword = function(plain: string): Promise<boolean> {
  return bcrypt.compare(plain, this.password);
};

export const EntitiesLogin: Model<IUserLogin> = mongoose.model<IUserLogin>(
  "entities_login", 
  userLoginSchema
);