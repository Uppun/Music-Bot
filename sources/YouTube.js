const url = require('url');

class YouTube {
    match(link) {
        const parse = url.parseUrl(link);
        return parse.hostname === 'youtu.be' || /\byoutube\b/.test(String(parse.hostname));
    }
}

module.exports = YouTube;