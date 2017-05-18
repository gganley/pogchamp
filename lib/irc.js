// #! /usr/bin/env node
'use strict';
var oauth2_library = require('simple-oauth2');
var crypto = require('crypto');
var express = require('express');
var request = require('request-promise-native');
var tmi = require("tmi.js");
var timer = require('timers');
var qs = require('querystring');
var opn = require('opn');
var MongoClient = require('mongodb').MongoClient;

var url = 'mongodb://localhost:27017/pogchamp';
var app = express();

var redirctUrl = 'http://localhost:3000/callback';

// This is for debugging purposes because I'm a terrible developer
var mongo = false;
var running = false;

// Init oauth2 w/ redentials
var credentials = {
    client: {
        id: '91la4bl9262yb59qfam5j9fkh8uonmn',
        secret: 'cnvgyol1tcteo580koumxb8ronfikv'
    },
    auth: {
        tokenHost: 'https://api.twitch.tv',
        tokenPath: 'kraken/oauth2/token',
        authorizePath: 'kraken/oauth2/authorize'
    }
};

var oauth2 = oauth2_library.create(credentials);

// make the token
var cryptoToken = crypto.randomBytes(16).toString('hex');

var authorizationUri = oauth2.authorizationCode.authorizeURL({
    redirect_uri: redirctUrl,
    scope: 'chat_login'
});

app.get('/auth', (req, res) => {
    res.redirect(authorizationUri);
});

app.get('/success', (req, res) => {
    res.send('');
});

app.get('/', (req, res) => {
    res.send('Hello<br><a href="/auth">Log in with Github</a>');
});

// Start the callback url
app.get('/callback', (req, res) => {
    const options = {
        client_secret: credentials.client.secret,
        redirect_uri: redirctUrl,
        code: req.query.code,
        grant_type: 'authorization_code'
    };

    oauth2.authorizationCode.getToken(options, (error, result) => {
        if (error) {
            return console.log('Access Token Error', error.message);
        }
        var token = oauth2.accessToken.create(result);
        gotToken(token);

        return res.status(200).json(token);
    });
});

app.listen(3000);


// Baron wasteland of functions
function getStreamObject(chid) {
    return request.get({
        url: "https://api.twitch.tv/kraken/streams/" + chid,
        headers: {
            'Client-ID': credentials.client.id,
            'Accept': 'application/vnd.twitchtv.v5+json'
        }
    }).then(JSON.parse);
}

function getVideosObject(chid) {
    return request.get({
        url: "https://api.twitch.tv/kraken/channels/" + chid + '/videos',
        headers: {
            'Client-ID': credentials.client.id,
            'Accept': 'application/vnd.twitchtv.v5+json'
        }
    }).then(JSON.parse);
}

function getBroadcastObject(chid, bid) {
    return getVideosObject(chid).then((videosObject) => {
        return videosObject.videos.filter(function(obj) {
            return obj.broadcast_id === bid;
        })[0];
    });
}

function getChidByBid(bid) {
    var chid;
    return chid;
}

function isLive(chid) {
    return getCurrentStreamObject(chid).then((obj) => {
        return obj.stream ? true : false;
    });
}

function topChins() {
    return request.get({
            url: "https://api.twitch.tv/kraken/streams" + '?' + qs.stringify({
                limit: 10,
                language: 'en'
            }),
            headers: {
                'Client-ID': credentials.client.id,
                'Accept': 'application/vnd.twitchtv.v5+json'
            }
        })
        .then(JSON.parse)
        .then(function(info) {
            return info.streams.map((stream) => {
                return stream.channel._id;
            });
        });
}

function topChannels() {
    return topChins()
        .then(objArray => {
            return objArray.map(getChannelName);
        })
        .then(obj => {
            return Promise.all(obj);
        });
}

function getChannelID(channel) {
    return request.get({
            url: "https://api.twitch.tv/kraken/users?login=" + channel,
            headers: {
                'Client-ID': credentials.client.id,
                'Accept': 'application/vnd.twitchtv.v5+json'
            }
        })
        .then(JSON.parse)
        .then((channelObject) => {
            return channelObject.users[0]._id;
        });
}

function getChannelName(chid) {
    return request.get({
            url: "https://api.twitch.tv/kraken/channels/" + chid,
            headers: {
                'Client-ID': credentials.client.id,
                'Accept': 'application/vnd.twitchtv.v5+json'
            }
        })
        .then(JSON.parse)
        .then((streamObject) => {
            return streamObject.name;
        });
}

var client;

// TODO test this function
function logUsingMongo(streamObject, message) {
    MongoClient.connect(url, function(err, db) {
        db.collection(streamObject.channel.name).update({
            bid: streamObject.stream._id
        }, {
            $push: {
                db: {
                    time: Date.now(),
                    message: message
                }
            }
        });
    });
}

// TODO fix this to conform to the new schema
// function getChannelDB(channel) {

//     MongoClient.connect(url, (err, db) => {
//         db.collection(channel).
//     })
// }

function gotToken(token) {
    if (running) {
        var options = {
            options: {
                debug: true
            },
            connection: {
                reconnect: true
            },
            identity: {
                username: "gganley1",
                password: "oauth:" + token.token.access_token.toString()
            }
        };
        // connect to IRC server
        client = new tmi.client(options);
        client.connect();
        client.on("chat", function(channel, userstate, message, self) {
            if (self) return;
            getChannelID(channel.slice(1))
                .then(getStreamObject)
                .then(streamObject => {
                    if (mongo) logUsingMongo(streamObject, messsage);
                });
        });
        timer.setInterval(() => {
            topChannels().then(topLiveChannels => {
                var joinedChannels = client.getChannels();
                for (var i = 0; i < 10; i++) {
                    if (joinedChannels.indexOf('#' + topLiveChannels[i]) == -1) {
                        // TODO Add bid to cache
                        getChannelID(topLiveChannels[i])
                            .then(getStreamObject)
                            .then(streamObject => {
                                MongoClient.connect(url, (err, db) => {
                                    db.collection(streamObject
                                        .stream
                                        .channel
                                        .name).insertOne({
                                        chin: streamObject.stream.channel._id,
                                        bid: streamObject.stream._id,
                                        db: []
                                    });
                                });
                            });
                        client.join('#' + topLiveChannels[i]);
                    }
                }

                joinedChannels = client.getChannels();
                Promise.all(joinedChannels.map(function(channel) {
                    isLive(channel.slice(1)).then(truthValue => {
                        if (!truthValue) {
                            client.part(channel);
                        }
                    });
                }));
            });
        }, 10000);
    }
}
