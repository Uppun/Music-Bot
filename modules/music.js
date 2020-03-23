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
            if (!queue[guildId].loop) {
                queue[guildId].songs.shift();
            }
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
                loop: false,
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
        return song;
    }
}

class MusicModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.searchMessages = {};
        this.queue = {};
        this.searchResults = {};

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
                    const addedSong = await addSong(args[1], this.queue, this.config, voiceChannel, guildId, textChannel);
                    textChannel.send(`Added ${addedSong.getTitle()} to queue!`);
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
            const modIds = this.config.get('moderator-ids');
            for (const modId of modIds) {
                if (!message.member.roles.has(modId)) {
                    return message.channel.send('You must be a mod to use that command!');
                }
            }
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
                loop: false,
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
            const author = message.author.id;
            const guildId = message.guild.id;
            const textChannel = message.channel;
            if (this.searchResults[author] === [] || this.searchResults[author] === undefined) {
                return;
            }
            if (!voiceChannel) {
                return;
            }

            const selection = message.content;
            const options = this.searchResults[author];
            if (selection.match(/[1-9]|10/)) {
                const index = parseInt(selection, 10);
                if (index > options.length) {
                    message.channel.send('That song doesn\'t exist!');
                    return;
                }
                const addedSong = await addSong(options[index-1].url, this.queue, this.config, voiceChannel, guildId, textChannel);
                message.channel.send(`${addedSong.getTitle()} added to queue!`);
                if (this.searchMessages[author]) {
                    this.searchMessages[author].delete();
                    this.searchMessages[author] = null;
                }
                this.searchResults[author] = [];
            }
            
        });

        this.dispatch.hook('$skip', message => {
            const serverQueue = this.queue[message.guild.id];
            const voiceChannel = message.member.voiceChannel;
            const guildId = message.guild.id;
            if (!voiceChannel) return message.channel.send('You need to be in a voice channel to skip!');
            if (!serverQueue) return message.channel.send('W-what am I supposed to skip?');
            if (!serverQueue.songs[0]) return message.channel.send('I can\'t skip if I\'m not playing anything...');
            if (serverQueue.loop) {
                serverQueue.loop = false;
            }
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
            const author = message.author.id;
            this.searchResults[author] = [];
            const searchTerms = message.content.substring('$search'.length, message.length).trim();
            const { videos } = await yts(searchTerms);
            const videoNum = videos.length > 10 ? 10 : videos.length;
            let entries = `> [${message.author.username}'s search results!]\n> **Type in the corresponding number to queue your song!**\n`;
            for (let i = 0; i < videoNum; i++) {
                this.searchResults[author].push(videos[i]);
                entries += (`> \`${i+1}.\` ${videos[i].author.name} - ${videos[i].title} [${videos[i].timestamp}]\n`);
            }
            
            message.channel.send(entries).then(response => {
                this.searchMessages[author] = response;
            });
        });

        this.dispatch.hook('$cancel', message => {
            const author = message.author.id;
            if (!this.searchResults[author]) {
                return message.channel.send('You have no pending search!');
            }

            this.searchResults[author] = [];
            if (this.searchMessages[author]) {
                this.searchMessages[author].delete();
                this.searchMessages[author] = null;
            }
            message.channel.send('Search cleared!');
        });

        this.dispatch.hook('$loop', message => {
            const guildId = message.guild.id;
            if (!this.queue[guildId]) {
                return message.channel.send('I can\'t loop a song when I\'m not even active!');
            }
            if (!this.queue[guildId].songs[0]) {
                return message.channel.send('I can\'t loop a song when I\'ve got nothing to play!');
            }

            if (!this.queue[guildId].loop) {
                this.queue[guildId].loop = true;
                return message.channel.send('I\'ll loop the current song!');
            }
            this.queue[guildId].loop = false;
            message.channel.send('I\'ll stop looping now!');      
        });

        this.dispatch.hook('$commands', message => {
            const voiceText = this.config.get('voice-text-channels');
            if (voiceText.includes(message.channel.id)) {
                const settingsList = `
                    \`\`\`\nIris Music Bot Commands
                    \n$play - Use with a youtube or soundcloud link to play a song from those sites, may also use search terms for youtube. (such as $play hot cross buns). Also compatible with Youtube playlists.
                    \n$search - Will search youtube with the given query, printing out the first 10 results. To add a song from those results, just type in the corresponding number.
                    \n$cancel - Cancels a current search.
                    \n$clear - Clears out all the songs currently in the queue.
                    \n$volume - Mods only, allows the moderators to adjust the volume level of the bot from a scale of 1-10. 5 is default.
                    \n$replay - Replays the song currently playing after it finishes.
                    \n$loop - Will loop the current song repeatedly until it is toggled off with another $loop call or with a $skip.
                    \n$skip - Will skip the current song or end a loop.
                    \n$np - Shows information on the song currently playing.
                    \n$queue - Shows all songs currently in the queue.
                    \n$pause - Pauses the current song.
                    \n$resume - Resumes a paused song.
                    \n$summon - Will call Iris into your current voice channel.
                    \n$disconnect - Will disconnect Iris from the current voice channel.
                    \n$move - Allows you to move songs around in the queue. $move 3 2 would move the third song to the second position.
                    \n$commands - Shows the commands, of course! How else are you seeing this...\`\`\`
                `;

                message.channel.send(settingsList)
            }
        });

        this.dispatch.hook('$queue', message => {
            const guildId = message.guild.id;
            const songs = this.queue[guildId].songs;
            let msg = ``;
            for (let i = 0; i < songs.length; i++) {
                const info = songs[i].getInfo();
                msg += `> \`${i + 1}\` ${info.author} - ${songs[i].getTitle()}\n`;
            }
            if (!msg) {
               return message.channel.send('Nothing is queued!');
            }
            message.channel.send(msg);
        });

        this.dispatch.hook('$move', message => {
            const guildId = message.guild.id;
            const songs = this.queue[guildId].songs;
            const trimmedMessage = message.content.substring('$move'.length, message.length).trim();
            const indexes = trimmedMessage.split(' ');
            const fromIndex = parseInt(indexes[0], 10);
            const toIndex = parseInt(indexes[1], 10);
            if (fromIndex === NaN || toIndex === NaN) {
                return message.channel.send('Incorrect format! If you want to move a queue item make sure you do it like this! `$move 4 2` to move the fourth item to the second spot!');
            }

            if (fromIndex - 1 === 0 || toIndex - 1 === 0) return message.channel.send('You can\'t move a song that is currently playing, or move a song into the now playing spot!');
            if (fromIndex > songs.length || fromIndex < 1) return message.channel.send('You can\'t move a song that doesn\'t exist...');
            if (toIndex > songs.length || toIndex < 1) return message.channel.send('You can\'t move a song outside of the queue...');

            songs.splice(toIndex - 1, 0, songs.splice(fromIndex - 1, 1)[0]);

            message.channel.send(`Moved the song from the ${fromIndex} position to position ${toIndex}!`);
        });
    }
}

module.exports = MusicModule;