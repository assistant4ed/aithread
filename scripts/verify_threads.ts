import dotenv from 'dotenv';
import { createContainer } from '../lib/threads_client';

dotenv.config();

const userId = process.env.THREADS_USER_ID;
const accessToken = process.env.THREADS_ACCESS_TOKEN;

async function verify() {
    console.log('🔍 Starting Threads API Verification...\n');

    if (!userId || !accessToken) {
        console.error('❌ Missing THREADS_USER_ID or THREADS_ACCESS_TOKEN in .env');
        console.error('Please check your .env file and ensure these variables are set.');
        return;
    }

    // 1. Verify Read Access (Profile)
    try {
        console.log('1️⃣  Verifying Read Access (Fetch Profile)...');
        const url = `https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url&access_token=${accessToken}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
            throw new Error(`API Error: ${data.error.message}`);
        }

        console.log(`   ✅ Success! Connected as @${data.username} (${data.name || 'No Name'})`);
    } catch (err: any) {
        console.error('   ❌ Read Access Failed:', err.message);
        console.log('   Check your THREADS_ACCESS_TOKEN and THREADS_USER_ID.');
        return; // Stop if read fails
    }

    // 2. Verify Write Access (Create Container only)
    try {
        console.log('\n2️⃣  Verifying Write Access (Create Container)...');
        console.log('   Attempting to create a "TEXT" container (this will NOT be published/live)...');

        const containerId = await createContainer(
            userId,
            accessToken,
            'TEXT',
            undefined, // No media URL
            `Verification Test - ${new Date().toISOString()}` // Text content
        );

        console.log(`   ✅ Success! Container created. ID: ${containerId}`);
        console.log('   (Note: This object exists on Threads but was NOT published to your feed.)');

    } catch (err: any) {
        console.error('   ❌ Write Access Failed:', err.message);
        console.log('   Check if your Access Token includes the "threads_content_publish" scope.');
    }

    console.log('\n🏁 Verification Complete.');
}

verify();
