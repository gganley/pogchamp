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

        token = oauth2.accessToken.create(result);

        return res.status(200).json(token);
    });
});

app.listen(3000);

function isLive(channel) {
    return request.get({
        url: "https://api.twitch.tv/kraken/streams/" + channel,
        headers: {
            'Client-ID': credentials.client.id
        }
    }).then(JSON.parse).then(function(streamObject) {
        return streamObject.stream ? true : false;
    });
}

function getCurrentStreamObject(channel) {
    return Promise.resolve(request.get({
        url: "https://api.twitch.tv/kraken/streams/" + channel,
        headers: {
            'Client-ID': credentials.client.id
        }
    }).then(JSON.parse).then((streamObject) => {
        return Promise.resolve({
            id: streamObject.stream._id,
            channel: streamObject.stream.channel.name
        });
    }));
}

function topChannels() {
    return request.get({
        url: "https://api.twitch.tv/kraken/streams" + '?' + qs.stringify({
            limit: 10,
            language: 'en'
        }),
        headers: {
            'Client-ID': credentials.client.id
        }
    }).then(JSON.parse).then(function(info) {
        var channels = [];
        for (var i = 0; i < 10; i++) {
            if (client.getChannels().indexOf(info.streams[i].channel.display_name) === -1) {
                channels[i] = (info.streams[i].channel.display_name);
            }
        }
        return channels;
    });
}

var client;

// Create timeout to get token
timer.setTimeout(() => {
    // Set options to send to the tmi client
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
        getCurrentStreamObject(channel.slice(1)).then(there => {
            MongoClient.connect(url, function(err, db) {
                console.log({
                    broadcastId: there.id,
                    time: Date.now(),
                    message: message
                });
                db.collection(channel.slice(1)).insertOne({
                    broadcastId: there.id,

                    time: Date.now(),
                    message: message
                });
            });
        });
    });
    timer.setInterval(() => {
        topChannels().then((topLiveChannels) => {
            var joinedChannels = client.getChannels();
            for (var i = 0; i < 10; i++) {
                if (joinedChannels.indexOf('#' + topLiveChannels[i]) == -1) {
                    client.join('#' + topLiveChannels[i]);
                }
            }

            joinedChannels = client.getChannels();
            Promise.all(joinedChannels.map(function (hello) {
                isLive(hello.slice(1)).then(truthValue => {
                    if (!truthValue) client.part(hello);
                });
            }));
        });
    }, 5000);
}, 30000);
