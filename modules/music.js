const ytdl = require('ytdl-core');
const Discord = require('discord.js');
const urlParser = require('../urlParser.js');
const yts = require('yt-search');


async function playSong(queue, guildId) {
    const song = queue[guildId].songs[0];
    if (!song) {
        queue[guildId].voiceChannel.leave();
        delete queue[guildId];
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

class MusicModule {
    constructor(context) {
        this.dispatch = context.dispatch;
        this.config = context.config;
        this.client = context.client;
        this.queue = {};
        this.searchResults = [];

        this.dispatch.hook('$play', async message => {
            const args = message.content.split(' ');
            const voiceChannel = message.member.voiceChannel;
            const guildId = message.guild.id;
            if (!voiceChannel) return message.channel.send('You need to be in a voice channel to add songs!');
            const permissions = voiceChannel.permissionsFor(this.client.user);
            if (!permissions.has('CONNECT') || permissions.has('SPEAK')) return message.channel.send('I do not have the permissions to join that voice channel and play music!');
            const song = await urlParser(args[1], this.config);
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
        });

        this.dispatch.hook('$skip', message => {
            const serverQueue = this.queue[message.guild.id];
            const voiceChannel = message.member.voiceChannel;
            if (!voiceChannel) return message.channel.send('You need to be in a voice channel to skip!');
            if (!serverQueue) return message.channel.send('W-what am I supposed to skip?');
            serverQueue.connection.dispatcher.end();
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
            if (this.queue[guildId].playing || !this.queue[guildId].songs[0]) return message.channel.send('I don\'t have anything to resume right now.');
            this.queue[guildId].playing = true;
            this.queue[guildId].connection.dispatcher.resume();
            message.channel.send('Resuming song.');
        });

        this.dispatch.hook('$search', async message => {
            const searchTerms = message.content.substring('$search'.length, message.length).trim();
            const { videos } = await yts(searchTerms);
            const videoNum = videos.length > 10 ? 10 : videos.length;
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