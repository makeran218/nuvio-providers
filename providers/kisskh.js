const MAIN_URL = "https://kisskh.ovh";
// API for Video Keys
const KISSKH_VIDEO_KEY_API = "https://script.google.com/macros/s/AKfycbzn8B31PuDxzaMa9_CQ0VGEDasFqfzI5bXvjaIZH4DM8DNq9q6xj1ALvZNz_JT3jF0suA/exec?id=";
// API for Subtitle Keys (from your Kotlin code)
const KISSKH_SUB_KEY_API = "https://script.google.com/macros/s/AKfycbyq6hTj0ZhlinYC6xbggtgo166tp6XaDKBCGtnYk8uOfYBUFwwxBui0sGXiu_zIFmA/exec?id=";
const TMDB_API_KEY = "b030404650f279792a8d3287232358e3";

async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    try {
        const type = mediaType === 'series' ? 'tv' : mediaType;
        const tmdbUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;

        const tmdbRes = await fetch(tmdbUrl);
        const tmdbData = await tmdbRes.json();
        const title = tmdbData.title || tmdbData.name;

        // 1. Search Drama
        const searchRes = await fetch(`${MAIN_URL}/api/DramaList/Search?q=${encodeURIComponent(title)}&type=0`);
        const searchList = await searchRes.json();
        let matched = searchList.find(item => item.title.toLowerCase().trim() === title.toLowerCase().trim()) || searchList[0];
        if (!matched) throw new Error("Drama not found");

        // 2. Get Episode ID
        const detailRes = await fetch(`${MAIN_URL}/api/DramaList/Drama/${matched.id}?isq=false`);
        const detail = await detailRes.json();
        const epToFind = episodeNum || 1;
        const targetEp = detail.episodes.find(ep => parseInt(ep.number) === parseInt(epToFind)) || detail.episodes[0];
        const epsId = targetEp.id;

        // 3. Get Video Key & Sources
        const videoKeyRes = await fetch(`${KISSKH_VIDEO_KEY_API}${epsId}&version=2.8.10`);
        const videoKeyData = await videoKeyRes.json();
        const videoApi = `${MAIN_URL}/api/DramaList/Episode/${epsId}.png?err=false&ts=&time=&kkey=${videoKeyData.key}`;
        const sourceRes = await fetch(videoApi);
        const sources = await sourceRes.json();

        // 4. Get Subtitle Key & Subtitles (New Logic)
        let subtitleTracks = [];
        try {
            const subKeyRes = await fetch(`${KISSKH_SUB_KEY_API}${epsId}&version=2.8.10`);
            const subKeyData = await subKeyRes.json();

            const subApi = `${MAIN_URL}/api/Sub/${epsId}?kkey=${subKeyData.key}`;
            const subRes = await fetch(subApi);
            const subData = await subRes.json(); // Array of { src, label }

            if (Array.isArray(subData)) {
                subtitleTracks = subData.map(sub => ({
                    url: sub.src,
                    language: sub.label === "Indonesia" ? "Indonesian" : sub.label,
                    format: sub.src.toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt'
                }));
            }
        } catch (subErr) {
            console.log("Subtitle extraction failed, skipping...");
        }

        // 5. Build Stream Objects
        const streams = [];
        const rawLinks = [
            { url: sources.Video, name: "Kisskh HLS" },
            { url: sources.ThirdParty, name: "Kisskh MP4" }
        ];

        rawLinks.forEach(item => {
            if (item.url && (item.url.includes('.m3u8') || item.url.includes('.mp4')) && !item.url.includes('/e/')) {
                const baseTitle = (matched && matched.title) ? matched.title : targetTitle;

                // 2. Determine Episode Number
                // Priority: targetEp.number > incoming episodeNum > "1"
                const epDisplay = (targetEp && targetEp.number) ? targetEp.number : (episodeNum || 1);

                // 3. Construct Final String
                const finalDisplayTitle = type === 'tv'
                    ? `${baseTitle} - Episode ${epDisplay}`
                    : `${baseTitle} (${targetYear || ''})`;
                streams.push({
                    name: item.name,
                    title: finalDisplayTitle,
                    url: item.url,
                    subtitles: subtitleTracks,
                    headers: {
                        "Origin": MAIN_URL,
                        "Referer": MAIN_URL,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    }
                });
            }
        });

        return streams;

    } catch (err) {
        console.error("Provider Error:", err.message);
        return [];
    }
}

module.exports = { getStreams };