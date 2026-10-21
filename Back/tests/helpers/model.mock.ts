import { vi } from "vitest";
import { Types } from "mongoose";

/**
 * Simule une Query Mongoose : `Model.findOne(...).session(s)`,
 * `.sort(...)`, `.populate(...)` sont chaînables et l'objet est « thenable »
 * pour que `await` renvoie la valeur fournie.
 */
export const mockQuery = <T>(value: T) => {
  const query: any = {
    session: vi.fn(() => query),
    sort: vi.fn(() => query),
    skip: vi.fn(() => query),
    limit: vi.fn(() => query),
    populate: vi.fn(() => query),
    select: vi.fn(() => query),
    lean: vi.fn(() => query),
    exec: vi.fn(() => Promise.resolve(value)),
    then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

/**
 * Construit un mock de modèle Mongoose utilisable à la fois comme
 * constructeur (`new Cart({...})`) et comme objet statique
 * (`Cart.findOne(...)`, `Cart.create(...)`, ...).
 *
 * Le constructeur reproduit le comportement de Mongoose : un `_id` et des
 * horodatages sont générés si le document n'en fournit pas, et `save()` est
 * un espion résolu sur le document lui-même.
 */
export const mockModel = () => {
  const ctor: any = vi.fn(function (this: any, docValues: Record<string, unknown> = {}) {
    this._id = new Types.ObjectId();
    this.createdAt = new Date("2026-01-01T10:00:00.000Z");
    this.updatedAt = new Date("2026-01-01T10:00:00.000Z");
    this.deletedAt = null;
    Object.assign(this, docValues);
    this.save = vi.fn().mockResolvedValue(this);
  });

  ctor.find = vi.fn(() => mockQuery([]));
  ctor.findOne = vi.fn(() => mockQuery(null));
  ctor.findById = vi.fn(() => mockQuery(null));
  ctor.findByIdAndUpdate = vi.fn(() => mockQuery(null));
  ctor.findByIdAndDelete = vi.fn(() => mockQuery(null));
  ctor.create = vi.fn(async (docs: any) => (Array.isArray(docs) ? docs : [docs]));
  ctor.updateMany = vi.fn(() => mockQuery({ acknowledged: true }));
  ctor.updateOne = vi.fn(() => mockQuery({ acknowledged: true }));
  ctor.deleteMany = vi.fn(() => mockQuery({ acknowledged: true }));
  ctor.countDocuments = vi.fn(() => mockQuery(0));
  ctor.estimatedDocumentCount = vi.fn(() => mockQuery(0));
  ctor.bulkWrite = vi.fn(async () => ({ ok: 1, modifiedCount: 0 }));
  ctor.aggregate = vi.fn(async () => []);
  ctor.findOneAndUpdate = vi.fn(() => mockQuery(null));
  ctor.distinct = vi.fn(() => mockQuery([]));

  return ctor;
};

export type MockModel = ReturnType<typeof mockModel>;
