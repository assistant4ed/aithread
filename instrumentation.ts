export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Import dynamically to avoid loading during build if not needed, 
        // though instrumentation connects at server startup.
        const { startPolling } = await import('./lib/cron');
        startPolling();
    }
}
