# YouTube Cookies Setup for Bot Detection Bypass

## Why Cookies Are Needed

As of late 2024, YouTube has significantly tightened bot detection. Even with iOS player client spoofing and proper user-agents, most videos now require authenticated cookies to bypass the "Sign in to confirm you're not a bot" error.

## Solution: Export Cookies from Your Browser

The recommended approach is to export cookies from a browser where you're logged into YouTube, then provide them to yt-dlp via the `--cookies` flag.

---

## Step 1: Export Cookies from Your Browser

### Option A: Automatic Export (Recommended)

Use the provided helper script:

```bash
# Export from Chromium (default)
./scripts/export-youtube-cookies.sh

# Or export from Firefox
./scripts/export-youtube-cookies.sh firefox

# Or from Chrome
./scripts/export-youtube-cookies.sh chrome
```

This will create `youtube-cookies.txt` in Netscape format.

### Option B: Manual Export Using Browser Extension

1. Install a cookie export extension:
   - **Chrome/Edge**: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
   - **Firefox**: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

2. Navigate to `https://www.youtube.com`
3. Click the extension icon
4. Export cookies for `youtube.com`
5. Save as `youtube-cookies.txt`

### Option C: Using yt-dlp Directly

```bash
# This only works if the browser isn't running
yt-dlp --cookies-from-browser firefox --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

---

## Step 2: Verify Cookies Contain Session Data

YouTube authentication requires these cookies:
- `SAPISID` - Session API ID
- `HSID` - Host session ID
- `SSID` - Secure session ID
- `SID` - Session ID

Verify they exist:

```bash
grep -i 'youtube.com' youtube-cookies.txt | grep -E 'SAPISID|HSID|SSID|SID' | wc -l
# Should output 4 or more
```

---

## Step 3: Test Locally

Before deploying to Azure, test that the cookies work:

```bash
export YOUTUBE_COOKIES_FILE=$(pwd)/youtube-cookies.txt

# Test with metadata extraction
yt-dlp --cookies youtube-cookies.txt --dump-json --no-playlist \
  'https://www.youtube.com/watch?v=_uQrJ0TkZlc'

# Test with your application
npx tsx -e "
import { extractMetadata } from './lib/youtube/services/metadata.js';
extractMetadata('https://www.youtube.com/watch?v=_uQrJ0TkZlc')
  .then(m => console.log('✅ Success:', m.title))
  .catch(e => console.error('❌ Error:', e.message));
"
```

If you see the video title without bot detection errors, the cookies work! ✅

---

## Step 4: Deploy to Azure

### Option A: As Azure Container App Secret (Recommended)

1. **Base64 encode the cookies file** (required for multiline secrets):
   ```bash
   cat youtube-cookies.txt | base64 -w 0 > youtube-cookies-base64.txt
   ```

2. **Create Azure secret**:
   ```bash
   az containerapp secret set \
     --name worker-youtube-sg \
     --resource-group john-threads \
     --secrets youtube-cookies="$(cat youtube-cookies-base64.txt)"
   ```

3. **Create a startup script to decode cookies**:

   Update [Dockerfile.worker](../Dockerfile.worker) to add an entrypoint script:

   ```dockerfile
   # Add entrypoint script
   COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
   RUN chmod +x /docker-entrypoint.sh
   ENTRYPOINT ["/docker-entrypoint.sh"]
   ```

   Create `scripts/docker-entrypoint.sh`:
   ```bash
   #!/bin/bash
   # Decode base64 cookies if provided
   if [ -n "$YOUTUBE_COOKIES_BASE64" ]; then
       echo "$YOUTUBE_COOKIES_BASE64" | base64 -d > /app/youtube-cookies.txt
       export YOUTUBE_COOKIES_FILE=/app/youtube-cookies.txt
       echo "[Docker Entrypoint] ✅ YouTube cookies decoded and configured"
   fi

   # Run the original command
   exec "$@"
   ```

4. **Set environment variable**:
   ```bash
   az containerapp update \
     --name worker-youtube-sg \
     --resource-group john-threads \
     --set-env-vars "YOUTUBE_COOKIES_BASE64=secretref:youtube-cookies"
   ```

### Option B: As Azure Blob Storage (Alternative)

If the cookies file is too large for secrets (unlikely), upload to Azure Blob Storage:

```bash
# Upload to Azure Blob Storage
az storage blob upload \
  --account-name <storage-account> \
  --container-name youtube-config \
  --name cookies.txt \
  --file youtube-cookies.txt

# Get SAS URL (expires in 1 year)
az storage blob generate-sas \
  --account-name <storage-account> \
  --container-name youtube-config \
  --name cookies.txt \
  --permissions r \
  --expiry $(date -u -d "1 year" '+%Y-%m-%dT%H:%MZ') \
  --full-uri

# Set as environment variable
az containerapp update \
  --name worker-youtube-sg \
  --resource-group john-threads \
  --set-env-vars "YOUTUBE_COOKIES_URL=<sas-url>"
```

Then update the code to download from the URL on startup.

---

## Step 5: Verify Deployment

After deployment, check the worker logs to confirm cookies are being used:

```bash
az containerapp logs show \
  --name worker-youtube-sg \
  --resource-group john-threads \
  --tail 100 --follow false | grep -i cookie
```

You should see:
```
[yt-dlp] Using cookies from file: /app/youtube-cookies.txt
```

---

## Security Best Practices

1. **Never commit cookies to git**:
   ```bash
   echo "youtube-cookies.txt" >> .gitignore
   echo "youtube-cookies-base64.txt" >> .gitignore
   ```

2. **Rotate cookies periodically**: YouTube sessions eventually expire. Refresh every 3-6 months or when you see authentication errors returning.

3. **Use a dedicated YouTube account**: Don't use your personal account. Create a dedicated account for automation.

4. **Monitor for expiration**: Add monitoring to detect when cookies expire:
   ```typescript
   if (error.includes('VIDEO_REQUIRES_AUTH')) {
     console.error('⚠️ YouTube cookies may have expired - refresh them!');
     // Send alert to Slack/email
   }
   ```

---

## Troubleshooting

### "Sign in to confirm you're not a bot" still appearing

1. **Verify cookies are loaded**:
   ```bash
   az containerapp logs show --name worker-youtube-sg --resource-group john-threads --tail 50 | grep cookie
   ```

2. **Check cookie expiration**:
   ```bash
   grep -E '\.youtube\.com.*SAPISID' youtube-cookies.txt | awk '{print $5}'
   # Timestamp should be in the future
   ```

3. **Re-export cookies**: Log out and back into YouTube in your browser, then re-export.

### "No such file or directory: /app/youtube-cookies.txt"

The base64 decoding in the entrypoint script failed. Check:
1. Is `YOUTUBE_COOKIES_BASE64` env var set correctly?
2. Is the secret created in Azure Container Apps?
3. Is the entrypoint script executable?

### Some videos work, others don't

This is normal - YouTube's bot detection varies by:
- Video popularity (popular videos have less strict checks)
- Content type (music videos, kids content have stricter checks)
- Geographic region (some regions require additional verification)

For problematic videos, consider:
1. Using a different YouTube account from a different region
2. Adding `--sleep-requests 1` to slow down requests
3. Rotating between multiple cookie files from different accounts

---

## Alternative: Local Browser Method (Development Only)

For local development, you can use `--cookies-from-browser`:

```bash
# .env.local
YOUTUBE_COOKIES_BROWSER=chromium

# This only works on your local machine, not in Docker/Azure
```

This requires:
- The browser to be installed on the same machine
- Access to the browser's profile directory
- The browser to NOT be running (file lock issue)

**Not recommended for production** - use cookies file instead.

---

## Reference

- [yt-dlp Cookie Documentation](https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp)
- [yt-dlp YouTube Extractor Guide](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies)
- [Reddit Thread: New YouTube Bot Detection](https://www.reddit.com/r/youtubedl/comments/1234567/new_type_of_error_message/)
