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
        const response = songInfo.player_response.videoDetails;
        return new Song(
            Discord.Util.escapeMarkdown(songInfo.title),
            songInfo.video_url,
            {
                description: response.shortDescription,
                thumbnail: response.thumbnail.thumbnails[0].url,
                author: response.author, 
            },
            () => ytdl(songInfo.video_url)
        );
    }
}

module.exports = YouTube;