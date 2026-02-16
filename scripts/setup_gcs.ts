import "dotenv/config";
import { storage, oauth2Client } from "../lib/google_client";
import readline from 'readline';
import fs from 'fs';
import path from 'path';

async function setupGCS() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (query: string): Promise<string> => {
        return new Promise((resolve) => rl.question(query, resolve));
    };

    try {
        let projectId = process.env.GOOGLE_PROJECT_ID;

        if (!projectId) {
            console.log("GOOGLE_PROJECT_ID not found in .env.");
            projectId = await question("Enter your Google Cloud Project ID: ");
        }

        const bucketName = `threads-monitor-assets-${Date.now()}`;
        console.log(`Creating bucket: ${bucketName} in project: ${projectId}...`);

        await storage.buckets.insert({
            project: projectId,
            requestBody: {
                name: bucketName,
                location: 'US', // Start with US, can be changed
                storageClass: 'STANDARD',
            },
            predefinedAcl: 'publicRead', // Make bucket contents public-ready (ACLs enabled)
            // or 'projectPrivate' and we explicitly set object ACLs. 
            // actually 'publicRead' on bucket might make *everything* public which is what we want?
            // 'predefinedAcl' for buckets.insert: Apply a predefined set of access controls to this bucket.
            // 'publicRead': Project team owners get OWNER access. AllAuthenticatedUsers get READ access. AllUsers get READ access.
            // YES, this makes the bucket public.
        });

        console.log(`Bucket ${bucketName} created successfully.`);

        // Update .env
        const envPath = path.join(process.cwd(), '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

        if (envContent.includes('GCS_BUCKET_NAME=')) {
            envContent = envContent.replace(/GCS_BUCKET_NAME=.*/, `GCS_BUCKET_NAME="${bucketName}"`);
        } else {
            envContent += `\nGCS_BUCKET_NAME="${bucketName}"\n`;
        }

        if (!envContent.includes('GOOGLE_PROJECT_ID=')) {
            envContent += `GOOGLE_PROJECT_ID="${projectId}"\n`;
        }

        fs.writeFileSync(envPath, envContent);
        console.log(`Updated .env with GCS_BUCKET_NAME="${bucketName}" and GOOGLE_PROJECT_ID="${projectId}"`);

    } catch (error) {
        console.error("Error setting up GCS:", error);
    } finally {
        rl.close();
    }
}

setupGCS();
