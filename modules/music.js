const ytdl = require('ytdl-core');
const Discord = require('discord.js');
const urlParser = require('../urlParser.js');


function playSong(queue, guildId) {
    const song = queue[guildId].songs[0];
    if (!song) {
        queue[guildId].voiceChannel.leave();
        delete queue[guildId];
        return;
    }

    const dispatcher = queue[guildId].connection.playStream(song.getSong())
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

class MusicModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.queue = {};

        this.dispatch.hook('$play', async message => {
            const args = message.content.split(' ');
            const voiceChannel = message.member.voiceChannel;
            const guildId = message.guild.id;
            if(voiceChannel) {
                const permissions = voiceChannel.permissionsFor(this.client.user);
                if (permissions.has('CONNECT') && permissions.has('SPEAK')) {
                    const song = await urlParser(args[1]);
                    if (song) {
                        if (!this.queue[guildId]) {
                            this.queue[guildId] = {
                                textChannel: message.channel,
                                voiceChannel,
                                connection: null,
                                songs: [],
                                volume: 5,
                                playing: true,
                            };
    
                            this.queue[guildId].songs.push(song);
    
                            try {
                                let connection = await voiceChannel.join();
                                this.queue[message.guild.id].connection = connection;
                                playSong(this.queue, guildId);
                            } catch (err) {
                                console.log(err);
                            }
                        } else {
                            this.queue[guildId].songs.push(song);
                            message.channel.send(`${song.title} has been added to the queue!`);
                        }
                    }
                } else {
                    message.channel.send('I do not have the permissions to join that voice channel and play music!');
                }
            } else {
                message.channel.send('You need to be in a voice channel to add songs!');
            }
        });

        this.dispatch.hook('$skip', message => {
            const serverQueue = this.queue[message.guild.id];
            const voiceChannel = message.member.voiceChannel;
            if (voiceChannel) {
                if (serverQueue) {
                    console.log(serverQueue.connection.dispatcher)
                    serverQueue.connection.dispatcher.end();
                } else {
                    message.channel.send('W-what am I supposed to skip?');
                }
            } else {
                message.channel.send('You need to be in a voice channel to skip!');
            }
        });

        this.dispatch.hook('$end', message => {
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
                const videoDetails = np.getInfo();
                const url = np.getUrl();
                const npEmbed = new Discord.RichEmbed()
                    .setTitle(videoDetails.title)
                    .setDescription(videoDetails.shortDescription)
                    .setURL(url)
                    .setThumbnail(videoDetails.thumbnail.thumbnails[0].url)
                    .setAuthor(videoDetails.author);
                message.channel.send(npEmbed);
            }
        });

        this.dispatch.hook('$pause', message => {
            const guildId = message.guild.id;
            if (this.queue[guildId].playing) {
                this.queue[guildId].playing = false;
                this.queue[guildId].connection.dispatcher.pause();
                message.channel.send('Pausing song.');
            } else {
                message.channel.send('There is nothing playing for me to pause!');
            }
        });

        this.dispatch.hook('$resume', message => {
            const guildId = message.guild.id;
            if (!this.queue[guildId].playing && this.queue[guildId].songs[0]) {
                this.queue[guildId].playing = true;
                this.queue[guildId].connection.dispatcher.resume();
                message.channel.send('Resuming song.');
            } else {
                message.channel.send('I don\'t have anything to resume right now.');
            }
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