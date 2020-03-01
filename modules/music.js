const Discord = require('discord.js');
const urlParser = require('../urlParser.js');
const yts = require('yt-search');
const ytpl = require('ytpl');


async function playSong(queue, guildId) {
    clearTimeout(queue[guildId].timer);
    const song = queue[guildId].songs[0];
    if (!song) {
        queue[guildId].playing = false;
        queue[guildId].timer = setTimeout(() => {
            queue[guildId].voiceChannel.leave();
            delete queue[guildId];
        }, 600000);
        return;
    }

    const dispatcher = queue[guildId].connection.playStream(await song.getSong())
        .on('end', () => {
            console.log('music ended')
            queue[guildId].songs.shift();
            console.log(`starting song ${queue[guildId].songs[0]}`)
            playSong(queue, guildId);
        })
        .on('error', () => {
            console.error(error);
        });

    dispatcher.setVolumeLogarithmic(queue[guildId].volume/5);
}

async function addSong(link, queue, config, voiceChannel, guildId, textChannel) {
    const song = await urlParser(link, config);
    if (song) {
        if (!queue[guildId]) {
            queue[guildId] = {
                textChannel,
                voiceChannel,
                connection: null,
                songs: [],
                volume: 5, 
                playing: true,
                timer: null,
            };

            queue[guildId].songs.push(song);

            try {
                let connection = await voiceChannel.join();
                queue[guildId].connection = connection;
                playSong(queue, guildId);
            } catch (err) {
                console.log(err)
            }
        } else {
            queue[guildId].songs.push(song);
            if (queue[guildId].timer) {
                playSong(queue, guildId);
            }
        }
    }
}

class MusicModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.searcher = null;
        this.queue = {};
        this.searchResults = [];

        this.dispatch.hook('$play', async message => {
            const args = message.content.split(' ');
            const voiceChannel = message.member.voiceChannel;
            const guildId = message.guild.id;
            const textChannel = message.channel;
            if (!voiceChannel) return textChannel.send('You need to be in a voice channel to add songs!');
            const permissions = voiceChannel.permissionsFor(this.client.user);
            if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) return message.channel.send('I do not have the permissions to join that voice channel and play music!');
            const url = new URL(args[1]);
            if (url.pathname === '/playlist' && url.searchParams.has('list')) {
                const playlistId = url.searchParams.get('list');
                ytpl(playlistId, (err, playlist) => {
                    if (err) throw err;
                    const songs = playlist['items'];
                    for (const song of songs) {
                        addSong(song.url_simple, this.queue, this.config, voiceChannel, guildId, textChannel);
                    }
                    textChannel.send('Playlist added to queue!');
                    return;
                });
            } else {
                addSong(args[1], this.queue, this.config, voiceChannel, guildId, textChannel);
                textChannel.send(`Song added to queue!`);
            }
        });

        this.dispatch.hook(null, async message => {
            const voiceChannel = message.member.voiceChannel;
            const guildId = message.guild.id;
            const textChannel = message.channel;
            if (!this.searcher) {
                return;
            }

            if (message.author.id === this.searcher) {
                if (!voiceChannel) return textChannel.send('You need to be in a voice channel to add songs!');
                const selection = message.content;
                if (selection.match(/[1-9]|10/)) {
                    const index = parseInt(selection, 10);
                    if (index > this.searchResults.length) {
                        message.channel.send('That song doesn\'t exist!');
                        return;
                    }
                    addSong(this.searchResults[index].url, this.queue, this.config, voiceChannel, guildId, textChannel);
                    this.searcher = null;
                    this.searchResults = [];
                }
            }
        });

        this.dispatch.hook('$skip', message => {
            const serverQueue = this.queue[message.guild.id];
            const voiceChannel = message.member.voiceChannel;
            if (!voiceChannel) return message.channel.send('You need to be in a voice channel to skip!');
            if (!serverQueue) return message.channel.send('W-what am I supposed to skip?');
            serverQueue.connection.dispatcher.end();
        });

        this.dispatch.hook('$disconnect', message => {
            const guildId = message.guild.id;
            if(message.member.voiceChannel && this.queue[guildId]) {
                this.queue[guildId].songs = [];
                this.queue[guildId].connection.dispatcher.end();
            }
        });

        this.dispatch.hook('$np', message => {
            const guildId = message.guild.id;
            const np = this.queue[guildId].songs[0];
            if (np) {
                const info = np.getInfo();
                const url = np.getUrl();
                const npEmbed = new Discord.RichEmbed()
                    .setTitle(np.getTitle())
                    .setDescription(info.description)
                    .setURL(url)
                    .setThumbnail(info.thumbnail)
                    .setAuthor(info.author);
                message.channel.send(npEmbed);
            }
        });

        this.dispatch.hook('$pause', message => {
            const guildId = message.guild.id;
            if (!this.queue[guildId].playing) return message.channel.send('There is nothing playing for me to pause!');
            this.queue[guildId].playing = false;
            this.queue[guildId].connection.dispatcher.pause();
            message.channel.send('Pausing song.');
        });

        this.dispatch.hook('$resume', message => {
            const guildId = message.guild.id;
            if (this.queue[guildId].playing && !this.queue[guildId].songs[0]) return message.channel.send('I don\'t have anything to resume right now.');
            this.queue[guildId].playing = true;
            this.queue[guildId].connection.dispatcher.resume();
            message.channel.send('Resuming song.');
        });

        this.dispatch.hook('$search', async message => {
            const searchTerms = message.content.substring('$search'.length, message.length).trim();
            const { videos } = await yts(searchTerms);
            const videoNum = videos.length > 10 ? 10 : videos.length;
            this.searcher = message.author.id;
            let entries = '';
            for (let i = 0; i < videoNum; i++) {
                this.searchResults.push(videos[i]);
                entries += (`${i+1}) ${videos[i].title} [${videos[i].timestamp}] | ${videos[i].author.name}\n`);
            }

            const searchEmbed = new Discord.RichEmbed()
                .setTitle(`${searchTerms} results`)
                .setDescription(entries);
            message.channel.send(searchEmbed);
        });

        this.dispatch.hook('$queue', message => {
            const guildId = message.guild.id;
            const songs = this.queue[guildId].songs;
            let msg = ``;
            for (let i = 0; i < songs.length; i++) {
                msg += `${i + 1}) ${songs[i].getInfo().title}\n`;
            }
            message.channel.send(msg);
        });
    }
}

module.exports = MusicModule;