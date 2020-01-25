const ytdl = require('ytdl-core');


function playSong(queue, guildId) {
    const song = queue[guildId].songs[0];
    if (!song) {
        queue[guildId].voiceChannel.leave();
        delete queue[guildId];
        return;
    }

    const dispatcher = queue[guildId].connection.playStream(ytdl(song.url))
        .on('end', () => {
            queue[guildId].songs.shift();
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

        this.dispatch.hook('?play', async message => {
            const args = message.content.split(' ');
            const voiceChannel = message.member.voiceChannel;
            const guildId = message.guild.id;
            if(voiceChannel) {
                const permissions = voiceChannel.permissionsFor(this.client.user);
                if (permissions.has('CONNECT') && permissions.has('SPEAK')) {
                    const songInfo = await ytdl.getInfo(args[1]);
                    const song = {
                        title: songInfo.title,
                        url: songInfo.video_url,
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
    }
}

module.exports = MusicModule;