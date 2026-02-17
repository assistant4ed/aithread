
import * as fs from 'fs';

async function checkUrl(url: string, label: string) {
    console.log(`Checking ${label}...`);
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(url, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            signal: controller.signal
        });
        clearTimeout(id);

        if (res.ok) {
            const len = res.headers.get('content-length');
            const type = res.headers.get('content-type');
            console.log(`  [${res.status}] Type: ${type}, Length: ${len} (${(Number(len) / 1024 / 1024).toFixed(2)} MB)`);
            return { url, valid: true, length: Number(len) };
        } else {
            console.log(`  [${res.status}] Failed`);
        }
    } catch (e: any) {
        console.log(`  Error: ${e.message}`);
    }
    return { url, valid: false, length: 0 };
}

async function main() {
    const html = fs.readFileSync('debug_page.html', 'utf-8');

    // Regex to find video_versions
    const regex = /"video_versions":\s*(\[[^\]]+\])/g;
    let match;

    while ((match = regex.exec(html)) !== null) {
        try {
            const jsonStr = match[1];
            const videoVersions = JSON.parse(jsonStr); // This might fail if JSON is incomplete in regex match

            console.log(`Found video_versions with ${videoVersions.length} candidates`);

            for (const v of videoVersions) {
                console.log(`\nCandidate Type: ${v.type}`);
                const url = v.url.replace(/\\u0026/g, '&');
                // console.log(`URL: ${url}`);
                await checkUrl(url, `Type ${v.type}`);
            }
        } catch (e) {
            // Regex might catch partial JSON, try to extract URLs directly if JSON parse fails
            console.warn("JSON parse failed, trying regex extraction for URLs...");
        }
    }

    // Also try to find any http.*?mp4 strings
    console.log('\n--- Scanning for raw .mp4 URLs ---');
    const urlRegex = /https?:\\\/\\\/[^"]+\.mp4[^"]*/g;
    const allMatches = html.match(urlRegex) || [];
    const uniqueUrls = new Set(allMatches.map(u => u.replace(/\\\//g, '/').replace(/\\u0026/g, '&')));

    console.log(`Found ${uniqueUrls.size} unique .mp4 URLs`);
    for (const url of uniqueUrls) {
        if (url.includes('dashinit')) console.log(`(Skip dashinit) ${url.substring(0, 100)}...`);
        else {
            console.log(`Checking raw URL: ${url.substring(0, 100)}...`);
            await checkUrl(url, 'Raw URL');
        }
    }
}

main().catch(console.error);
