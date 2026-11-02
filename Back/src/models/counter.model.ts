import mongoose, { Model, Schema, type ClientSession } from "mongoose";

// ─────────────────────────────────────────────
//  COMPTEURS
//  Numéros lisibles et croissants (SUP-000123) : un document par série,
//  incrémenté de façon atomique.
// ─────────────────────────────────────────────
interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } });

export const Counter: Model<ICounter> = mongoose.model<ICounter>("counter", counterSchema);

/** Prochain numéro de la série `name` (1, 2, 3…). */
export const nextSequence = async (name: string, session?: ClientSession): Promise<number> => {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, ...(session ? { session } : {}) }
  );
  return counter?.seq ?? 1;
};
