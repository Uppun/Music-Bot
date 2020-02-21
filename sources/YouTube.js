const url = require('url');
const Song = require('../song.js');
const Discord = require('discord.js');
const ytdl = require('ytdl-core');

class YouTube {
    match(link) {
        const parse = url.parse(link);
        return parse.hostname === 'youtu.be' || /\byoutube\b/.test(String(parse.hostname));
    }

    async obtainSong(link, config) {
        const songInfo = await ytdl.getInfo(link);
        const response = songInfo.player_response;

        return new Song(
            Discord.Util.escapeMarkdown(songInfo.title),
            songInfo.video_url,
            response.videoDetails,
            (url) => ytdl(url)
        );
    }
}

module.exports = YouTube;