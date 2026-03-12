#!/bin/bash
set -e

echo "[Docker Entrypoint] Starting container initialization..."

# Decode base64 YouTube cookies if provided
if [ -n "$YOUTUBE_COOKIES_BASE64" ]; then
    echo "[Docker Entrypoint] 🍪 Decoding YouTube cookies from base64..."
    echo "$YOUTUBE_COOKIES_BASE64" | base64 -d > /app/youtube-cookies.txt

    # Verify the file was created and has content
    if [ -s /app/youtube-cookies.txt ]; then
        export YOUTUBE_COOKIES_FILE=/app/youtube-cookies.txt
        COOKIE_COUNT=$(wc -l < /app/youtube-cookies.txt)
        echo "[Docker Entrypoint] ✅ YouTube cookies decoded successfully (${COOKIE_COUNT} lines)"

        # Verify it contains YouTube session cookies
        if grep -q 'youtube.com' /app/youtube-cookies.txt; then
            echo "[Docker Entrypoint] ✅ YouTube session cookies detected"
        else
            echo "[Docker Entrypoint] ⚠️  Warning: No youtube.com cookies found in file"
        fi
    else
        echo "[Docker Entrypoint] ❌ Error: Cookie file is empty after decoding"
    fi
else
    echo "[Docker Entrypoint] ⚠️  No YOUTUBE_COOKIES_BASE64 env var - cookies not configured"
    echo "[Docker Entrypoint] Videos may fail with bot detection. See docs/YOUTUBE_COOKIES_SETUP.md"
fi

echo "[Docker Entrypoint] ✅ Initialization complete"
echo "[Docker Entrypoint] Executing command: $@"
echo ""

# Execute the original command (e.g., "pnpm worker:youtube")
exec "$@"
