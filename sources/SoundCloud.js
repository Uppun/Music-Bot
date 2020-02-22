const url = require('url');
const Song = require('../song.js');
const Discord = require('discord.js');
const qs = require('querystring');
const fetch = require('node-fetch');
class SoundCloud {
    match(link) {
        const parse = url.parse(link);
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

        return fetch(scUrl.href, {redirect: 'follow'})
            .then((res) => {
               return res.json().then(data => {
                    if (!res.ok) {
                        throw new Error(`Soundcloud API error`);
                    }
                    
                    if (data.kind !== 'track') throw new Error('URL is not a track');
                    if (!data.streamable) throw new Error('Track is not streamable');
                    if (!data.stream_url) throw new Error('No stream URL found');

                    return new Song(
                        data.title,
                        data.permalink_url,
                        {
                            title: data.title,
                            description: data.title,
                            thumbnail: data.artwork_url || data.user.avatar_url,
                            author: data.user.username,
                        },
                        data.stream_url,
                        (url) => {
                            const streamURL = new URL(url);
                            streamURL.search = qs.stringify({client_id: key});
                            console.log(streamURL)
                            return fetch(streamURL.href).then(res => {
                                console.log(res.body)
                                return res.body;
                            });
                        }
                    );
                });
            })
            .catch((err) => {
                console.error(err);
                throw new Error(`SoundCloud API error - ${err.message}`);
              });
    }
}

module.exports = SoundCloud;