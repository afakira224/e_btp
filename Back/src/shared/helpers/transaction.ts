import mongoose, { type ClientSession } from "mongoose";

/**
 * Exécute `work` dans une transaction : validée s'il aboutit, annulée s'il
 * lève. La session est toujours fermée. Les effets externes (emails,
 * prestataire de paiement) se font APRÈS, une fois la transaction validée.
 */
export const runInTransaction = async <T>(work: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};
