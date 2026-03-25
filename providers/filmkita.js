const MAIN_URL = "https://s4.iix.llc";
const TMDB_API_KEY = "b030404650f279792a8d3287232358e3";

/**
 * Robust Decoder for Layarwibu /player2/ Base64
 */
/**
 * Universal Base64 Decoder (Node + Browser/Plugin compatible)
 */
function decodeLayarwibu(url) {
    try {
        if (url.includes("/player2/")) {
            const match = url.match(/\/player2\/([A-Za-z0-9+/=]+)/);
            if (match && match[1]) {
                const encoded = decodeURIComponent(match[1]);
                let decoded = "";

                // Check for Node.js Buffer
                if (typeof Buffer !== 'undefined') {
                    decoded = Buffer.from(encoded, 'base64').toString('utf-8');
                }
                // Fallback to Browser/WebView atob
                else if (typeof atob !== 'undefined') {
                    decoded = atob(encoded);
                }
                // Manual fallback for very restricted engines
                else {
                    return url;
                }

                decoded = decoded.trim();
                if (decoded.startsWith("http")) return decoded;
            }
        }
    } catch (e) {
        // Log error if your environment supports console
    }
    return url;
}

async function getStreams(tmdbId, mediaType, seasonNum = 1, episodeNum = 1) {
    const streams = [];
    const headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };

    try {
        // 1. Resolve Title
        const isTV = mediaType === 'tv' || mediaType === 'series';
        const type = isTV ? 'tv' : 'movie';
        const tmdbRes = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`);
        const tmdbData = await tmdbRes.json();
        const title = tmdbData.title || tmdbData.name;
        if (!title) return [];

        // 2. Search
        const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(title)}&post_type%5B%5D=post&post_type%5B%5D=tv`;
        const searchRes = await fetch(searchUrl, { headers });
        const searchHtml = await searchRes.text();

        const mainLinkMatch = searchHtml.match(/<a href="([^"]+)" class="button gmr-watch-button"/i);
        let currentUrl = mainLinkMatch ? mainLinkMatch[1] : null;
        if (!currentUrl) return [];

        // 3. TV Navigation
        if (isTV) {
            const showPageRes = await fetch(currentUrl, { headers });
            const showPageHtml = await showPageRes.text();
            const epRegex = new RegExp(`<a[^>]+href="([^"]+)"[^>]*>S${seasonNum}\\s+Eps${episodeNum}<\/a>`, 'i');
            const epMatch = showPageHtml.match(epRegex);
            if (!epMatch) return [];
            currentUrl = epMatch[1];
        }

        // 4. Extract Iframe
        const finalPageRes = await fetch(currentUrl, { headers });
        const finalPageHtml = await finalPageRes.text();
        const iframeRegex = /<div class="gmr-embed-responsive"><iframe src="([^"]+)"/i;
        let streamUrl = finalPageHtml.match(iframeRegex)?.[1];

        // 5. AJAX Fallback
        if (!streamUrl) {
            const postId = (finalPageHtml.match(/data-id="(\d+)"/) || finalPageHtml.match(/postid-(\d+)/))?.[1];
            if (postId) {
                const ajaxRes = await fetch(`${MAIN_URL}/wp-admin/admin-ajax.php`, {
                    method: 'POST',
                    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', 'Referer': currentUrl },
                    body: new URLSearchParams({ 'action': 'muvipro_player_content', 'tab': 'muvipro-player-content-1', 'post_id': postId })
                });
                const ajaxHtml = await ajaxRes.text();
                const ajaxMatch = ajaxHtml.match(/src=\\?["']([^"'\\]+)\\?["']/) || ajaxHtml.match(/src=["']([^"']+)["']/);
                if (ajaxMatch) streamUrl = ajaxMatch[1].replace(/\\/g, '');
            }
        }

        if (streamUrl) {
            // Clean the URL before decoding
            if (streamUrl.startsWith('//')) streamUrl = `https:${streamUrl}`;

            // EXECUTE DECODE
            const decodedUrl = decodeLayarwibu(streamUrl);
            const urlObj = new URL(decodedUrl);
            // 1. Construct the Display Title based on Media Type
            let displayTitle = title; // This is the 'title' or 'name' we got from TMDB earlier

            if (isTV) {
                // Formats as: "High Potential - S1 E6"
                displayTitle = `${title} - S${seasonNum} E${episodeNum}`;
            }
            streams.push({
                name: "Layarwibu HLS",
                title: displayTitle,
                url: decodedUrl,
                headers: {
                    "Referer": `${urlObj.origin}/`,
                    "Origin": urlObj.origin,
                    "User-Agent": headers['User-Agent']
                }
            });
        }

        return streams;
    } catch (err) {
        return [];
    }
}

module.exports = { getStreams };