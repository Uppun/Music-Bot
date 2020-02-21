const YouTube = require('./sources/YouTube.js');
const SoundCloud = require('./sources/SoundCloud.js');

const sources = [YouTube, SoundCloud];

async function findSource(link, config) {
    for (const source of sources) {
        const handler = new source();
        if (handler.match(link)) {
            return await handler.obtainSong(link, config);
        }
    }
}

module.exports = findSource;