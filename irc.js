// #! /usr/bin/env node

var oauth2_library = require('simple-oauth2');
var crypto = require('crypto');
var express = require('express');
var request = require('request-promise-native');
var tmi = require("tmi.js");
var timer = require('timers');
var qs = require('querystring');

var app = express();

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
    redirect_uri: 'http://localhost:3000/callback',
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

var token;

// Start the callback url
app.get('/callback', (req, res) => {
    const options = {
        client_secret: 'cnvgyol1tcteo580koumxb8ronfikv',
        redirect_uri: 'http://localhost:3000/callback',
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
    }).then(JSON.parse).then(function (streamObject) {
        return streamObject.stream ? true : false;
    });
}

function topChannels() {
    request.get({
        url: "https://api.twitch.tv/kraken/streams" + '?' + qs.stringify({limit: 10, language: 'en'}),
        headers: {
            'Client-ID': credentials.client.id
        }
    }).then(function (e, r, b) {
        if (!error && response.statusCode == 200) {
            var channels;
            var info = JSON.parse(b);
            for (var i = 0; i < 10; i++) {
                if (client.getChannels().indexOf(info.streams[i].channel.display_name) === -1) {
                    channels[i] = (info.streams[i].channel.display_name);
                }
            }
            return channels;
        } else {
            return [];
        }
    });
}

function programLoop() {
    topChannels().then((topLiveChannels) => {
        var joinedChannels = client.getChannels();
        for (var i = 0; i < 10; i++) {
            if (joinedChannels.indexOf('#' + topLiveChannels[i]) == -1) {
                client.join('#' + topLiveChannels[i]);
            }
        }
        joinedChannels = client.getChannels();
        for (var i = 0; i < joinedChannels.length; i++) {
            isLive(joinedChannels[i].slice(1)).then((liveValue) => {
                if (!liveValue) client.part(joinedChannels[i]);
            });
        }
    });
}

const opn = require('opn');
var client;

// Connect to get token
opn('http://localhost:3000/auth', {app: 'firefox'}).then(() => {
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
    client.on("chat", function (channel, userstate, message, self) {
        if (self) return;
        console.log(Date.now() + ',' + message);
    });
}).then(() => {
    // Create timer to join top 10 channels
    timer.setInterval(function () {
        request.get({
            url: "https://api.twitch.tv/kraken/streams" + '?' + qs.stringify({limit: 10, language: 'en'}),
            headers: {
                'Client-ID': credentials.client.id
            }
        }, function (e, r, b) {
            if (!error && response.statusCode == 200) {
                var info = JSON.parse(b);
                for (var i = 0; i < 10; i++) {
                    if (client.getChannels().indexOf(info.streams[i].channel.display_name) === -1) {
                        client.join('#' + info.streams[i].channel.display_name);
                    }
                }
            }
        });
    }, 5000);
});
