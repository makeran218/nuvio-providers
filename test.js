// test-myprovider.js
const { getStreams } = require('./providers/filmkita.js');

async function test() {
    console.log('--- Starting Extraction Test ---');
    try {
        // Calling getStreams with a TMDB ID and Type
        const streams = await getStreams('226637', 'tv', 1, 3);

        console.log(`Summary: Found ${streams.length} stream(s)\n`);

        if (streams.length > 0) {
            streams.forEach((stream, index) => {
                console.log(`[Stream #${index + 1}]`);
                console.log(`Source:  ${stream.name}`);
                console.log(`Quality: ${stream.quality}`);
                console.log(`URL:     ${stream.url}`);

                // If your extractor provides extra metadata like size or headers
                if (stream.size) console.log(`Size:    ${(stream.size / (1024 ** 3)).toFixed(2)} GB`);
                if (stream.headers) console.log(`Headers: ${JSON.stringify(stream.headers)}`);
                if (stream.subtitles) {
                    console.log(`Subtitles: Found ${stream.subtitles.length} tracks`);
                    stream.subtitles.forEach(s => console.log(`  - [${s.language}] ${s.url}`));
                }
                console.log('-----------------------------------');
            });
        } else {
            console.log('No streams found. Check your provider logic or TMDB ID.');
        }
    } catch (error) {
        console.error('Error during extraction:', error.message);
    }
}

test();