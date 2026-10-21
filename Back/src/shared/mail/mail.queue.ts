 
import logger from "../logger/logger.js";
import { sendMail } from "./mail.service.js";

// ─────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────
interface MailJob {
  id: number;
  to: string;
  subject: string;
  html: string;
  attempt?: number;
}

interface QueueStats {
  pending: number;
  active: number;
  total: number;
}

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const MAX_RETRIES    = 3;
const RETRY_DELAY_MS = 5000;
const CONCURRENCY    = 2;

let activeJobs = 0;
let jobCounter = 0;
const queue: MailJob[] = [];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────
//  PROCESSOR
// ─────────────────────────────────────────────
const processJob = async (job: MailJob): Promise<void> => {
  const { to, subject, html, attempt = 1 } = job;

  logger.info(`[MailQueue] 🔄 Job #${job.id} → ${to} [tentative ${attempt}/${MAX_RETRIES}]`);

  try {
    await sendMail({ to, subject, html });
    logger.info(`[MailQueue] ✅ Job #${job.id} réussi → ${to}`);
  } catch (err) {
    logger.error(`[MailQueue] ❌ Job #${job.id} échoué → ${(err as Error).message}`);

    if (attempt < MAX_RETRIES) {
      logger.info(`[MailQueue] ⏳ Retry dans ${(RETRY_DELAY_MS * attempt) / 1000}s...`);
      await sleep(RETRY_DELAY_MS * attempt);
      await processJob({ ...job, attempt: attempt + 1 });
    } else {
      logger.error(`[MailQueue] 💀 Job #${job.id} abandonné après ${MAX_RETRIES} tentatives.`);
    }
  }
};

// ─────────────────────────────────────────────
//  RUNNER
// ─────────────────────────────────────────────
const runNext = async (): Promise<void> => {
  if (activeJobs >= CONCURRENCY || queue.length === 0) return;

  activeJobs++;
  const job = queue.shift()!;

  try {
    await processJob(job);
  } finally {
    activeJobs--;
    void runNext();
  }
};

// ─────────────────────────────────────────────
//  API PUBLIQUE
// ─────────────────────────────────────────────
export const addToQueue = (job: Omit<MailJob, "id">): number => {
  const newJob: MailJob = { ...job, id: ++jobCounter };
  queue.push(newJob);
  logger.info(`[MailQueue] 📥 Job #${newJob.id} ajouté (${queue.length} en attente) → ${job.to}`);
  void runNext();
  return newJob.id;
};

export const getStats = (): QueueStats => ({
  pending: queue.length,
  active:  activeJobs,
  total:   jobCounter,
});
