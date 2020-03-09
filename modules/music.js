const Discord = require('discord.js');
const findSource = require('../findSource.js');
const yts = require('yt-search');
const ytpl = require('ytpl');


async function playSong(queue, guildId) {
    clearTimeout(queue[guildId].timer);
    queue[guildId].timer = null;
    const song = queue[guildId].songs[0];
    if (!song) {
        queue[guildId].playing = false;
        queue[guildId].timer = setTimeout(() => {
            queue[guildId].voiceChannel.leave();
            if (queue[guildId]) {
                delete queue[guildId];
            }
        }, 600000);
        return;
    }

    queue[guildId].lastSong = queue[guildId].songs[0];

    queue[guildId].playing = true;
    const dispatcher = queue[guildId].connection.playStream(await song.getSong())
        .on('end', () => {
            queue[guildId].songs.shift();
            playSong(queue, guildId);
        })
        .on('error', (error) => {
            console.error(error);
        });
    dispatcher.setVolumeLogarithmic(queue[guildId].volume/5);
}

async function addSong(link, queue, config, voiceChannel, guildId, textChannel) {
    const song = await findSource(link, config);
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
                lastSong: null,
                paused: false,
            };

            queue[guildId].songs.push(song);

            try {
                let connection = await voiceChannel.join();
                queue[guildId].connection = connection;
                playSong(queue, guildId);
            } catch (err) {
                console.log(err);
                return;
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
            try {
                const url = new URL(args[1]);
                if (url.pathname === '/playlist' && url.searchParams.has('list')) {
                    const playlistId = url.searchParams.get('list');
                    ytpl(playlistId, async (err, playlist) => {
                        if (err) throw err;
                        const songs = playlist['items'];
                        for (const song of songs) {
                            if (song) {
                                await addSong(song.url_simple, this.queue, this.config, voiceChannel, guildId, textChannel);
                            }
                        }
                        textChannel.send('Playlist added to queue!');
                        return;
                    });
                } else {
                    addSong(args[1], this.queue, this.config, voiceChannel, guildId, textChannel);
                    textChannel.send(`Song added to queue!`);
                }
            } catch (_) {
                const searchTerms = message.content.substring('$search'.length, message.length).trim();
                if (!searchTerms) {
                    if (this.queue[guildId].paused) {
                        this.queue[guildId].playing = true;
                        this.queue[guildId].paused = false
                        this.queue[guildId].connection.dispatcher.resume();
                        return message.channel.send('Resuming song.');
                    } else {
                        return;
                    }
                }
                const { videos } = await yts(searchTerms);
                if (!videos[0]) {
                    return textChannel.send('No results found...');
                }
                textChannel.send(`Adding ${videos[0].title} to the queue!`);
                addSong(videos[0].url, this.queue, this.config, voiceChannel, guildId, textChannel);
            }

        });

        this.dispatch.hook('$clear', message => {
            const args = message.content.split(' ');
            const voiceChannel = message.member.voiceChannel;
            const guildId = message.guild.id;
            const textChannel = message.channel;
            if (!voiceChannel) return textChannel.send('You need to be in a voice channel to clear the queue!');
            if (!this.queue[guildId]) return textChannel.send('I have nothing to clear!');
            this.queue[guildId].songs = [];
            textChannel.send('Queue has been cleared!');

        });
        this.dispatch.hook('$volume', message => {
            const args = message.content.split(' ');
            const voiceChannel = message.member.voiceChannel;
            const guildId = message.guild.id;
            const textChannel = message.channel;
            if (!voiceChannel) return textChannel.send('You need to be in a voice channel modify volume!');
            if (!this.queue[guildId]) return textChannel.send('I\'m not playing anything to set volume on!');
            if (isNaN(args[1]) || args[1] > 10 || args[1] < 1) {
                return textChannel.send('Please only use a volume between 1 and 10!');
            }

            this.queue[guildId].volume = parseInt(args[1], 10);
            this.queue[guildId].connection.dispatcher.setVolumeLogarithmic(this.queue[guildId].volume/5);
            textChannel.send(`Volume set to ${args[1]}!`);
        });

        this.dispatch.hook('$replay', message => {
            const voiceChannel = message.member.voiceChannel;
            const guildId = message.guild.id;
            const textChannel = message.channel;
            if (!voiceChannel) return textChannel.send('You need to be in a voice channel to replay songs!');
            const permissions = voiceChannel.permissionsFor(this.client.user);
            if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) return message.channel.send('I do not have the permissions to join that voice channel and play music!');
            if (!this.queue[guildId]) return textChannel.send('Nothing to replay!');
            if (!this.queue[guildId].lastSong) return textChannel.send('Nothing to replay!');

            const replaySong = this.queue[guildId].lastSong;
            if (this.queue[guildId].playing) {
                this.queue[guildId].songs.splice(1, 0, replaySong);
                return textChannel.send('I will replay this song after the current song finishes!');
            }
            this.queue[guildId].songs = [replaySong, ...this.queue[guildId].songs];
            playSong(this.queue, guildId);
            return textChannel.send('Playing previous song!');
        });

        this.dispatch.hook('$summon', async message => {
            const voiceChannel = message.member.voiceChannel;
            const guildId = message.guild.id;
            const textChannel = message.channel;
            if (!voiceChannel) return textChannel.send('You need to be in a voice channel to summon me!');
            if (this.queue[guildId]) return textChannel.send('I\'m already in a channel! I can\'t join another.');
            this.queue[guildId] = {
                textChannel,
                voiceChannel,
                connection: null,
                songs: [],
                volume: 5, 
                playing: false,
                timer: setTimeout(() => {
                    this.queue[guildId].voiceChannel.leave();
                    if (queue[guildId]) {
                        delete queue[guildId];
                    }
                    }, 600000),
                lastSong: null,
                paused: false,
            };
            try {
                let connection = await voiceChannel.join();
                this.queue[guildId].connection = connection;
            } catch (err) {
                console.log(err);
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
                    addSong(this.searchResults[index-1].url, this.queue, this.config, voiceChannel, guildId, textChannel);
                    message.channel.send('Song added!');
                    this.searcher = null;
                    this.searchResults = [];
                }
            }
        });

        this.dispatch.hook('$skip', message => {
            const serverQueue = this.queue[message.guild.id];
            const voiceChannel = message.member.voiceChannel;
            const guildId = message.guild.id;
            if (!voiceChannel) return message.channel.send('You need to be in a voice channel to skip!');
            if (!serverQueue) return message.channel.send('W-what am I supposed to skip?');
            if (!serverQueue.songs[0]) return message.channel.send('I can\'t skip if I\'m not playing anything...');
            serverQueue.connection.dispatcher.end();
        });

        this.dispatch.hook('$disconnect', message => {
            const guildId = message.guild.id;
            if(message.member.voiceChannel && this.queue[guildId]) {
                if (this.queue[guildId]) {
                    this.queue[guildId].songs = [];
                }
                if (this.queue.connection) {
                    this.queue[guildId].connection.dispatcher.end();
                }
                if (this.queue[guildId].voiceChannel) {
                    this.queue[guildId].voiceChannel.leave();
                }
                delete this.queue[guildId]
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
            this.queue[guildId].paused = true;
            this.queue[guildId].connection.dispatcher.pause();
            message.channel.send('Pausing song.');
        });

        this.dispatch.hook('$resume', message => {
            const guildId = message.guild.id;
            if (this.queue[guildId].playing && !this.queue[guildId].songs[0]) return message.channel.send('I don\'t have anything to resume right now.');
            this.queue[guildId].playing = true;
            this.queue[guildId].paused = false;
            this.queue[guildId].connection.dispatcher.resume();
            message.channel.send('Resuming song.');
        });

        this.dispatch.hook('$search', async message => {
            this.searchResults = [];
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
                .setTitle(`${searchTerms} results\nType in the number to select your desired song!`)
                .setDescription(entries);
            message.channel.send(searchEmbed);
        });

        this.dispatch.hook('$queue', message => {
            const guildId = message.guild.id;
            const songs = this.queue[guildId].songs;
            let msg = ``;
            for (let i = 0; i < songs.length; i++) {
                msg += `${i + 1}) ${songs[i].getTitle()}\n`;
            }
            if (!msg) {
               return message.channel.send('Nothing is queued!');
            }
            message.channel.send(msg);
        });
    }
}

module.exports = MusicModule;