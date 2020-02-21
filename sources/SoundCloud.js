const url = require('url');

class SoundCloud {
    match(link) {
        const parse = parseUrl(link);
        return parse.hostname === 'snd.sc' || /(www\.)?soundcloud\.com/.test(String(parse.hostname));
    }

    obtainSong(link, config) {
        const key = config.get('soundcloud-key');

        if (!key) {
            return Promise.reject(new Error('Soundcloud API key not found'));
        }

        const scUrl = new URL('https://api.soundcloud.com/resolve');
        scUrl.search = qs.stringify({
            url: link,
            client_id: key,
        });

        return fetch(url.href, {redirect: 'follow'})
            .then((res) => {
                res.json().then(data => {
                    if (!res.ok) {
                        throw new Error(`Soundcloud API error`);
                    }
                    
                    if (data.kind !== 'track') throw new Error('URL is not a track');
                    if (!data.streamable) throw new Error('Track is not streamable');
                    if (!data.stream_url) throw new Error('No stream URL found');
                })
            })
    }
}

module.exports = SoundCloud;