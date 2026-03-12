import { Queue } from 'bullmq';
import { redisConnection, YOUTUBE_QUEUE_NAME } from '../lib/queue.js';

const queue = new Queue(YOUTUBE_QUEUE_NAME, { connection: redisConnection });

async function cleanQueue() {
  console.log('🧹 Cleaning YouTube automation queue...');

  // Get all job statuses
  const [waiting, active, delayed, failed, completed] = await Promise.all([
    queue.getWaiting(),
    queue.getActive(),
    queue.getDelayed(),
    queue.getFailed(),
    queue.getCompleted()
  ]);

  console.log('📊 Queue status:');
  console.log('  - Waiting:', waiting.length);
  console.log('  - Active:', active.length);
  console.log('  - Delayed:', delayed.length);
  console.log('  - Failed:', failed.length);
  console.log('  - Completed:', completed.length);

  let totalRemoved = 0;

  // Clean failed jobs
  if (failed.length > 0) {
    console.log(`🗑️  Removing ${failed.length} failed jobs...`);
    for (const job of failed) {
      await job.remove();
      totalRemoved++;
    }
  }

  // Clean completed jobs
  if (completed.length > 0) {
    console.log(`🗑️  Removing ${completed.length} completed jobs...`);
    for (const job of completed) {
      await job.remove();
      totalRemoved++;
    }
  }

  // Clean stale waiting jobs (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  const staleWaiting = waiting.filter(j => j.timestamp < tenMinutesAgo);
  if (staleWaiting.length > 0) {
    console.log(`🗑️  Removing ${staleWaiting.length} stale waiting jobs...`);
    for (const job of staleWaiting) {
      await job.remove();
      totalRemoved++;
    }
  }

  // Clean stale active jobs (older than 30 minutes)
  const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
  const staleActive = active.filter(j => j.timestamp < thirtyMinutesAgo);
  if (staleActive.length > 0) {
    console.log(`🗑️  Removing ${staleActive.length} stale active jobs...`);
    for (const job of staleActive) {
      await job.remove();
      totalRemoved++;
    }
  }

  console.log(`✅ Queue cleaned! Removed ${totalRemoved} jobs.`);
  await queue.close();
  process.exit(0);
}

cleanQueue().catch(err => {
  console.error('❌ Error cleaning queue:', err);
  process.exit(1);
});
