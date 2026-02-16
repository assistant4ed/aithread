
import 'dotenv/config';
import { checkAndPublishApprovedPosts } from '../lib/publisher_service';

async function main() {
    await checkAndPublishApprovedPosts();
}

main();

