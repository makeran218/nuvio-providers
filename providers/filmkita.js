const MAIN_URL = "https://s4.iix.llc";
const TMDB_API_KEY = "b030404650f279792a8d3287232358e3";

/**
 * Decodes Layarwibu HLS from player2 Base64 strings
 */
function decodeLayarwibu(url) {
    try {
        if (url.includes("/player2/")) {
            const encodedPart = url.split("/player2/")[1].split("?")[0];
            const decoded = Buffer.from(decodeURIComponent(encodedPart), 'base64').toString('utf-8').trim();
            if (decoded.startsWith("http")) return decoded;
        }
    } catch (e) {
        console.log("[-] Base64 Decode Fail:", e.message);
    }
    return url;
}

async function getStreams(tmdbId, mediaType, seasonNum = 1, episodeNum = 1) {
    const streams = [];
    const headers = {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };

    try {
        // 1. Get Title from TMDB
        const isTV = mediaType === 'tv' || mediaType === 'series';
        const type = isTV ? 'tv' : 'movie';
        const tmdbRes = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`);
        const tmdbData = await tmdbRes.json();
        const title = tmdbData.title || tmdbData.name;
        if (!title) return [];

        console.log(`[*] Target: ${title} | S${seasonNum} E${episodeNum}`);

        // 2. Search for the main Show/Movie
        const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(title)}&post_type%5B%5D=post&post_type%5B%5D=tv`;
        const searchRes = await fetch(searchUrl, { headers });
        const searchHtml = await searchRes.text();

        const mainLinkMatch = searchHtml.match(/<a href="([^"]+)" class="button gmr-watch-button"/i);
        let currentUrl = mainLinkMatch ? mainLinkMatch[1] : null;

        if (!currentUrl) {
            console.log("[-] Main content link not found.");
            return [];
        }

        // 3. Navigate to Episode for TV
        if (isTV) {
            const showPageRes = await fetch(currentUrl, { headers });
            const showPageHtml = await showPageRes.text();

            // Match the S{X} Eps{Y} button
            const epRegex = new RegExp(`<a[^>]+href="([^"]+)"[^>]*>S${seasonNum}\\s+Eps${episodeNum}<\/a>`, 'i');
            const epMatch = showPageHtml.match(epRegex);

            if (!epMatch) {
                console.log(`[-] Episode S${seasonNum} E${episodeNum} not found.`);
                return [];
            }
            currentUrl = epMatch[1];
            console.log(`[+] Episode URL: ${currentUrl}`);
        }

        // 4. LOAD FINAL PAGE & EXTRACT IFRAME DIRECTLY
        const finalPageRes = await fetch(currentUrl, { headers });
        const finalPageHtml = await finalPageRes.text();

        // Target the gmr-embed-responsive div specifically
        const iframeRegex = /<div class="gmr-embed-responsive"><iframe src="([^"]+)"/i;
        let streamUrl = finalPageHtml.match(iframeRegex)?.[1];

        // 5. Fallback to AJAX if direct iframe is missing (e.g. lazy loaded)
        if (!streamUrl) {
            console.log("[*] Iframe not found in HTML, trying AJAX...");
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
            if (streamUrl.startsWith('//')) streamUrl = `https:${streamUrl}`;
            console.log(`[!] Raw Embed: ${streamUrl}`);

            const decodedUrl = decodeLayarwibu(streamUrl);
            const urlObj = new URL(decodedUrl);

            console.log(`[+] Final HLS: ${decodedUrl}`);

            streams.push({
                name: "Layarwibu HLS",
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
        console.log(`[!] Error: ${err.message}`);
        return [];
    }
}

module.exports = { getStreams };