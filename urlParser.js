const YouTube = require('./handlers/YouTube.js');
const SoundCloud = require('./handlers/SoundCloud.js');

const sources = [YouTube, SoundCloud];

export default function findSource(link) {
    for (const source of sources) {
        if (source.match(link)) {
            return source.getSong(link);
        }
    }
}