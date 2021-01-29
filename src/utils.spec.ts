import { SinonSandbox, createSandbox } from 'sinon';
import { expect } from 'chai';
import * as utils from './utils';

describe('Utils', () => {
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('randomIRCColor', () => {
    it('Returns a string', () => {
      expect(typeof utils.randomIRCColor()).to.equal('string');
    });
  });

  describe('getIRCColorFunc', () => {
    it('Returns a function', () => {
      expect(typeof utils.getIRCColorFunc('blah')).to.equal('function');
      expect(typeof utils.getIRCColorFunc('blue')).to.equal('function');
    });
  });

  describe('spaceNick', () => {
    it('Returns string which contains the unicode 200B char', () => {
      expect(utils.spaceNick('nick')).to.include('\u200B');
    });
  });

  describe('sleep', () => {
    it('Stops execution for specified amount of time', async () => {
      const now = Date.now();
      await utils.sleep(10);
      expect(Date.now() - 9).to.be.gte(now);
    });
  });

  describe('matchIRCHostMask', () => {
    it('Returns false if irc hostmask does not match data', () => {
      [
        ['not!you@now', 'nick', 'ident', 'host'],
        ['not!*@*', 'nick', 'ident', 'host'],
        ['*!not@*', 'nick', 'ident', 'host'],
        ['*!*@not', 'nick', 'ident', 'host'],
        ['*@not', 'nick', 'ident', 'host'],
        ['not', 'nick', 'ident', 'host'],
      ].forEach((vals) => {
        expect(utils.matchIRCHostMask(vals[0], vals[1], vals[2], vals[3]), vals.join(',')).to.be.false;
      });
    });

    it('Returns true if irc hostmask does match data', () => {
      [
        ['*!*@*', 'nick', 'ident', 'host'],
        ['nick!*@*', 'nick', 'ident', 'host'],
        ['nick!ident@*', 'nick', 'ident', 'host'],
        ['nick!ident@host', 'nick', 'ident', 'host'],
        ['n?ck!ide?t@h??t', 'nick', 'ident', 'host'],
        ['ident@host', 'nick', 'ident', 'host'],
        ['host', 'nick', 'ident', 'host'],
      ].forEach((vals) => {
        expect(utils.matchIRCHostMask(vals[0], vals[1], vals[2], vals[3]), vals.join(',')).to.be.true;
      });
    });
  });

  describe('minutesToString', () => {
    it('Returns appropriate hour string if an hour or longer', () => {
      expect(utils.minutesToString(60)).to.equal('one hour');
      expect(utils.minutesToString(61)).to.equal('one hour');
      expect(utils.minutesToString(119.99)).to.equal('one hour');
      expect(utils.minutesToString(120)).to.equal('2 hours');
      expect(utils.minutesToString(179)).to.equal('2 hours');
      expect(utils.minutesToString(98372)).to.equal('1639 hours');
    });

    it('Returns appropriate minute string if less than an hour', () => {
      expect(utils.minutesToString(0.123)).to.equal('0 minutes');
      expect(utils.minutesToString(1)).to.equal('a minute');
      expect(utils.minutesToString(8.23942835)).to.equal('8 minutes');
      expect(utils.minutesToString(59.99)).to.equal('59 minutes');
    });
  });

  describe('dateToFriendlyString', () => {
    it('Outputs expected string for the given date', () => {
      expect(utils.dateToFriendlyString(new Date('2001-01-01T03:12:46.123Z'))).to.equal('2001-01-01 03:12:46 UTC');
      expect(utils.dateToFriendlyString(new Date('2999-12-28T19:31:39.999Z'))).to.equal('2999-12-28 19:31:39 UTC');
    });
  });
});
