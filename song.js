class Song {
    constructor(title, url, info, streamUrl, songFunc) {
        this.title = title;
        this.url = url;
        this.streamUrl = streamUrl;
        this.info = info;
        this.songFunc = songFunc;
    }

    getTitle() {
        return this.title;
    }

    getUrl() {
        return this.url;
    }

    getInfo() {
        return this.info;
    }

    getSong() {
        return this.songFunc(this.streamUrl);
    }
}

module.exports = Song;