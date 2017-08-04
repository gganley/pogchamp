// #! /usr/bin/env node
'use strict';
const oauth2_library = require('simple-oauth2');
const crypto = require('crypto');
const express = require('express');
const request = require('request-promise-native');
const tmi = require("tmi.js");
const timer = require('timers');
const qs = require('querystring');
const opn = require('opn');
const MongoClient = require('mongodb').MongoClient;
const csvWriter = require('csv-write-stream');
const fs = require('fs');

const url = 'mongodb://localhost:27017/pogchamp';
var app = express();

const redirectUrl = 'http://73.143.234.50:3000/callback';

// This is for debugging purposes because I'm a terrible developer
const mongo = true;
const running = true;

// Init oauth2 w/ redentials
const credentials = {
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
    redirect_uri: redirectUrl,
    scope: 'chat_login'
});

/*
  Express routes
*/

// Initial point to connect to
app.get('/auth', (req, res) => {
    res.redirect(authorizationUri);
});

// Honestly don't know why this is here
app.get('/success', (req, res) => {
    res.send('');
});

// If you forget to go to /
app.get('/', (req, res) => {
    res.send('Hello<br><a href="/auth">Log in with Github</a>');
});

// The meat and potatoes callback url
app.get('/callback', (req, res) => {
    const options = {
        client_secret: credentials.client.secret,
        redirect_uri: redirectUrl,
        code: req.query.code,
        grant_type: 'authorization_code'
    };

    oauth2.authorizationCode.getToken(options, (error, result) => {
        if (error)
            return console.log('Access Token Error', error.message);

        var token = oauth2.accessToken.create(result);
        gotToken(token);

        return res.status(200).json(token);
    });
});

// Start server and listen on port 3000
app.listen(3000);

/*
  Baron wasteland of Twitch API functions
*/

// Current stream object, has viewers, bid, chid, all the fixings
function getStreamObject(chid) {
    return request.get({
        url: "https://api.twitch.tv/kraken/streams/" + chid,
        headers: {
            'Client-ID': credentials.client.id,
            'Accept': 'application/vnd.twitchtv.v5+json'
        }
    }).then(JSON.parse);
}

// Used to get list of VOD's, includes bid and VOD link
function getVideosObject(chid) {
    return request.get({
        url: "https://api.twitch.tv/kraken/channels/" + chid + '/videos',
        headers: {
            'Client-ID': credentials.client.id,
            'Accept': 'application/vnd.twitchtv.v5+json'
        }
    }).then(JSON.parse);
}

// Uses the getVideosObject to get a single broadcast
function getBroadcastObject(chid, bid) {
    return getVideosObject(chid).then((videosObject) => {
        return videosObject.videos.filter(function(obj) {
            return obj.broadcast_id === bid;
        })[0];
    });
}

function getChannelID(channel) {
    return request.get({
        url: "https://api.twitch.tv/kraken/users?login=" + channel,
        headers: {
            'Client-ID': credentials.client.id,
            'Accept': 'application/vnd.twitchtv.v5+json'
        }
    }).then(JSON.parse).then((channelObject) => {
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
    }).then(JSON.parse).then((streamObject) => {
        return streamObject.name;
    });
}

// TODO I think this can be done in a much cleaner way, something like stream.stream_type
function isLive(chid) {
    return getCurrentStreamObject(chid).then((obj) => {
        return obj.stream ? true : false;
    });
}

// Get top 10 chin's in relation to viewers
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
    }).then(JSON.parse).then(function(info) {
        return info.streams.map((stream) => {
            return stream.channel._id;
        });
    });
}

// Uses topChins and returns channelnames
function topChannels() {
    return topChins().then(objArray => {
        return objArray.map(getChannelName);
    }).then(obj => {
        return Promise.all(obj);
    });
}

// TODO test this function
function logUsingMongo(bid, chid, channelName, message) {
    MongoClient.connect(url, function(err, db) {
        if(err) {
            console.log(err);
        } else {
            db.collection('broadcasts').insertOne({
                bid,
                chid,
                channelName,
                message
            });
        }
    });
}

function getBroadcastDatabase(bid) {
    MongoClient.connect(url, (err, db) => {
        return db.collection('broadcasts').find({bid}, {db: 1});
    });
}

// Function run after user credentials are received by the server
function gotToken(token) {
    if (running) {
        // Options for the twitch IRC
        var options = {
            options: {
                debug: true
            },
            connection: {
                reconnect: true
            },
            identity: {
                username: "gganley1",
                password: "oauth:" + token.token.access_token
            }
        };

        // connect to IRC server
        var client = new tmi.client(options);
        client.connect();

        // Log chat to mongo
        client.on("chat", function(channel, userstate, message, self) {
            if (self) return;
            getChannelID(channel.slice(1)).then(getStreamObject).then(streamObject => {
                if (mongo) {
                    logUsingMongo(streamObject.stream._id, streamObject.stream.channel._id, channel.slice(1), message);
                } else {
                    fs.appendFile(channel.slice(1) + '-' + streamObject.stream._id + '.csv', Date.now() + ',' + message + '\n', err => {
                        if (err) throw err;
                    });
                }
            });
        });

        // Join and part logic
        timer.setInterval(() => {
            topChannels().then(topLiveChannels => {
                var joinedChannels = client.getChannels();
                for (var i = 0; i < 10; i++) {
                    if (joinedChannels.indexOf('#' + topLiveChannels[i]) == -1) {
                        client.join('#' + topLiveChannels[i]);
                    }
                }

                // Get channels again because new channels could have been joined
                joinedChannels = client.getChannels();
                Promise.all(joinedChannels.map(channel => {
                    isLive(channel.slice(1)).then(truthValue => {
                        if (!truthValue)
                            client.part(channel);
                    });
                }));n
            });
        }, 10000);
    }
}
