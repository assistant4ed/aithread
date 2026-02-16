
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer);
        });
    });
};

async function main() {
    console.log('--- Threads Long-Lived Token Exchange ---\n');

    const appId = await question('Enter your Threads App ID: ');
    const appSecret = await question('Enter your Threads App Secret: ');
    const shortLivedToken = await question('Enter your Short-Lived User Access Token: ');

    if (!appId || !appSecret || !shortLivedToken) {
        console.error('\nError: Missing required inputs.');
        rl.close();
        return;
    }

    try {
        console.log('\nExchanging token...');

        // 1. Exchange for Long-Lived Token
        const exchangeUrl = `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`;

        const exchangeRes = await fetch(exchangeUrl, { method: 'GET' });
        const exchangeData = await exchangeRes.json();

        if (exchangeData.error) {
            throw new Error(`Token Exchange Error: ${exchangeData.error.message}`);
        }

        const longLivedToken = exchangeData.access_token;
        console.log('✅ Obtained Long-Lived Token!');

        // 2. Get User ID
        console.log('Fetching User ID...');
        const userUrl = `https://graph.threads.net/me?fields=id,username&access_token=${longLivedToken}`;

        const userRes = await fetch(userUrl, { method: 'GET' });
        const userData = await userRes.json();

        if (userData.error) {
            throw new Error(`User Fetch Error: ${userData.error.message}`);
        }

        const userId = userData.id;
        const username = userData.username;
        console.log(`✅ Found User: ${username} (ID: ${userId})`);

        console.log('\n--- SUCCESS! Add these to your .env file: ---\n');
        console.log(`THREADS_USER_ID="${userId}"`);
        console.log(`THREADS_ACCESS_TOKEN="${longLivedToken}"`);
        console.log('\n----------------------------------------------');

    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
    } finally {
        rl.close();
    }
}

main();
