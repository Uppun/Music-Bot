const ytdl = require('ytdl-core');
const Discord = require('discord.js');


function playSong(queue, guildId) {
    const song = queue[guildId].songs[0];
    if (!song) {
        queue[guildId].voiceChannel.leave();
        delete queue[guildId];
        return;
    }

    const dispatcher = queue[guildId].connection.playStream(ytdl(song.url))
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
                    const songInfo = await ytdl.getInfo(args[1]);
                    const response = songInfo.player_response;

                    const song = {
                        title: songInfo.title,
                        url: songInfo.video_url,
                        videoDetails: response.videoDetails,
                    };

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
                const {videoDetails, url} = np;
                const npEmbed = new Discord.RichEmbed()
                    .setTitle(videoDetails.title)
                    .setDescription(videoDetails.shortDescription)
                    .setURL(url)
                    .setThumbnail(videoDetails.thumbnail.thumbnails[0].url)
                    .setAuthor(videoDetails.author);
                message.channel.send(npEmbed);
            }
        });

        this.dispatch.hook('$queue', message => {
            const guildId = message.guild.id;
            const songs = this.queue[guildId].songs;
            let msg = ``;
            for (let i = 0; i < songs.length; i++) {
                msg += `${i + 1}) ${songs[i].videoDetails.title}\n`;
            }
            message.channel.send(msg);
        });
    }
}

module.exports = MusicModule;