#!/bin/bash
# Export YouTube cookies from your browser for yt-dlp
# This script helps you export cookies in Netscape format that yt-dlp can use

set -e

COOKIES_FILE="youtube-cookies.txt"
BROWSER="${1:-chromium}"

echo "=== YouTube Cookie Exporter for yt-dlp ==="
echo ""
echo "This script will export cookies from your browser."
echo "Make sure you're logged into YouTube in ${BROWSER} before running this!"
echo ""

# Check if yt-dlp is installed
if ! command -v yt-dlp &> /dev/null; then
    echo "❌ Error: yt-dlp is not installed"
    echo "Install it with: curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp"
    exit 1
fi

echo "🔍 Exporting cookies from ${BROWSER}..."
echo ""

# Export cookies using yt-dlp's built-in extraction
# This creates a Netscape cookies.txt file
yt-dlp --cookies-from-browser ${BROWSER} --cookies ${COOKIES_FILE} --skip-download "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>&1 | grep -i "cookie\|extract" || true

if [ -f "${COOKIES_FILE}" ]; then
    echo ""
    echo "✅ Cookies exported successfully!"
    echo "📄 File: ${COOKIES_FILE}"
    echo "📊 Size: $(wc -l < ${COOKIES_FILE}) lines"
    echo ""
    echo "Next steps:"
    echo "1. Verify cookies contain YouTube session data:"
    echo "   grep -i 'youtube.com' ${COOKIES_FILE} | grep -i 'SAPISID\|HSID\|SSID' | wc -l"
    echo ""
    echo "2. Upload to Azure as a secret:"
    echo "   cat ${COOKIES_FILE} | base64 -w 0 > youtube-cookies-base64.txt"
    echo "   # Then create Azure secret with this base64 content"
    echo ""
    echo "3. Or test locally first:"
    echo "   export YOUTUBE_COOKIES_FILE=\$(pwd)/${COOKIES_FILE}"
    echo "   yt-dlp --cookies ${COOKIES_FILE} 'https://www.youtube.com/watch?v=_uQrJ0TkZlc'"
    echo ""
    echo "⚠️  IMPORTANT: Keep this file secure! It contains your YouTube session."
    echo "⚠️  Add ${COOKIES_FILE} to .gitignore to prevent accidental commits."
else
    echo ""
    echo "❌ Failed to export cookies from ${BROWSER}"
    echo ""
    echo "Troubleshooting:"
    echo "1. Make sure you're logged into YouTube in ${BROWSER}"
    echo "2. Close ${BROWSER} completely (some browsers lock the cookie database)"
    echo "3. Try a different browser: chromium, firefox, chrome, brave, edge"
    echo "   Usage: $0 <browser-name>"
    echo ""
    echo "Example: $0 firefox"
    exit 1
fi
