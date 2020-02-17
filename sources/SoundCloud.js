const url = require('url');

export default class SoundCloud {
    match(link) {
        const parse = url.parseUrl(link);
        return parse.hostname === 'snd.sc' || /(www\.)?soundcloud\.com/.test(String(parse.hostname));
    }
}