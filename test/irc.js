var expect = require('chai').expect,
    singon = require('sinon'),
    mockery = require('mockery');

var sandbox = sinon.sandbox.create(),
    url = 'mongodb://localhost:27017/pogchamp-test',
    irc,
    MongoClient;

describe('PogChamp', () => {
    before(() => {
        mockery.enable();
    });

    beforeEach(() => {
        // TODO determine if every library needs to be greenlit here
        mockery.registerAllowable('mongodb');
        mockery.registerAllowable('../lib/irc.js', true);
        irc = require('../lib/irc.js');
        MongoClient = require('mongodb').MongoClient;
    });

    after(() => {
        mockery.disable();
    });

    describe('CHID and ChannelName', () => {
        it('should be able to reverse given a CHID', () => {
            var chid = 24991333;
            return irc.getChannelName(chid).then(irc.getChannelID).then(obj => {
                expect(obj).to.equal(chid);
            });
        });
        it('should be able to reverse given a ChannelName', () => {
            var channelName = 'imaqtpie';
            return irc.getChannelID(channelName).then(getChannelName).then(obj => {
                expect(obj).to.equal(channelName);
            });
        });
    });

    describe('MongoDB', () => {
        it('should add one to an existing broadcast', () => {
            var args = ['25335660160', '24991333', 'imaqtpie', 'this is a test123'];
            irc.logUsingMongo.apply(null, args);
            var broadcastDb = irc.getBroadcastDatabase(args[0]).db;
            expect(braodcastDb.filter(obj => {
                return obj.message === args[3];
            })).to.not.be.empty;
        });
        it('should create a new broadcast object if one does not exits', () => {
            var args = ['123123', '106953358', 'gganley1', 'something something'];
        });
        it('should add a channel entry if one does not exist', () => {

        });
    });
});
