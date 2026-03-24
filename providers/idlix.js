const cheerio = require('cheerio-without-node-native');

// Use the domain from your successful HTML log
const BASE_URL = "https://tv12.idlixku.com";

async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    try {
        console.log(`--- Fetching Metadata for TMDB: ${tmdbId} ---`);

        const tmdbUrl = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=b030404650f279792a8d3287232358e3`;
        const tmdbRes = await fetch(tmdbUrl);
        const tmdbData = await tmdbRes.json();

        if (!tmdbData.name && !tmdbData.title) {
            console.error("TMDB Data not found. Check your API Key or ID.");
            return [];
        }

        const title = tmdbData.title || tmdbData.name;
        const year = (tmdbData.release_date || tmdbData.first_air_date || "").substring(0, 4);

        // IDLIX SLUG RULE: lowercase, no special chars, dashes for spaces
        const slug = title.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-');

        let targetUrl;
        if (mediaType === 'movie') {
            targetUrl = `${BASE_URL}/movie/${slug}-${year}/`;
        } else {
            // Updated TV Pattern: Often Idlix uses /episode/slug-season-X-episode-Y/
            targetUrl = `${BASE_URL}/episode/${slug}-season-${seasonNum}-episode-${episodeNum}/`;
        }

        console.log("Targeting URL:", targetUrl);

        const response = await fetch(targetUrl);
        if (response.status === 404) {
            console.error(`404 Error: Idlix slug might be different. Tried: ${targetUrl}`);
            return [];
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        // Find the player tokens
        const scriptContent = $('script').filter((i, s) => {
            const h = $(s).html();
            return h && h.includes('window.idlix');
        }).html();

        if (!scriptContent) {
            console.error("No player tokens (Nonce/Time) found on page.");
            return [];
        }

        const nonce = scriptContent.match(/window\.idlixNonce=['"]([a-f0-9]+)['"]/)?.[1];
        const time = scriptContent.match(/window\.idlixTime=(\d+)/)?.[1];

        const streams = [];
        const playerOptions = $('ul#playeroptionsul > li').toArray();

        for (const el of playerOptions) {
            const data = {
                action: 'doo_player_ajax',
                post: $(el).attr('data-post'),
                nume: $(el).attr('data-nume'),
                type: $(el).attr('data-type'),
                _n: nonce,
                _t: time
            };

            const ajaxRes = await fetch(`${BASE_URL}/wp-admin/admin-ajax.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(data).toString()
            }).then(r => r.json());

            if (ajaxRes.embed_url) {
                // Since we can't use crypto-js, we take the raw embed (iframe)
                // and extract the link if it's not encrypted, or return the data for manual handling
                console.log(`Found Source [${data.nume}]: ${ajaxRes.embed_url.substring(0, 50)}...`);
                streams.push({
                    server: data.nume,
                    data: ajaxRes.embed_url
                });
            }
        }

        return streams;
    } catch (err) {
        console.error("Scraper Crash:", err);
        return [];
    }
}

