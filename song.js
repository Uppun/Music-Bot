class Song {
    constructor(title, url, info, songFunc) {
        this.title = title;
        this.url = url;
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
        console.log(this.url)
        console.log(this.songFunc)
        return this.songFunc(this.url);
    }
}

module.exports = Song;