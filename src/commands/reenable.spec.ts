import { createSandbox, SinonSandbox, SinonStub, assert, match } from 'sinon';
import { expect } from 'chai';

import { ReenableCommand } from './reenable.js';
import { LevelDB } from '../clients/leveldb.js';
import { IRCClient } from '../clients/irc.js';
import { ABClient } from '../clients/animebytes.js';
import { QueueManager } from '../manager/queue.js';

describe('ReenableCommand', () => {
  let sandbox: SinonSandbox;
  let hookStub: SinonStub;

  beforeEach(() => {
    sandbox = createSandbox();
    hookStub = sandbox.stub(IRCClient, 'addMessageHookInChannel');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('register', () => {
    let putStub: SinonStub;
    let getStub: SinonStub;

    beforeEach(() => {
      putStub = sandbox.stub(LevelDB, 'put');
      getStub = sandbox.stub(LevelDB, 'get').resolves({});
    });

    it('Calls addMessageHookInChannel on the IRC bot', async () => {
      await ReenableCommand.register();
      assert.calledTwice(hookStub);
    });

    it('Retrieves and sets error cache from state', async () => {
      const fakeTime = new Date('2020-02-02T02:02:02.000Z');
      sandbox.useFakeTimers({ now: fakeTime, toFake: ['Date'] });
      getStub.resolves({ userHost: { fails: 3, last: fakeTime.toJSON() } });
      await ReenableCommand.register();
      expect(ReenableCommand.errorCache).to.haveOwnProperty('userHost');
    });

    it('Handles missing cache state when loading', async () => {
      getStub.throws({ code: 'LEVEL_NOT_FOUND' });
      await ReenableCommand.register();
      expect(ReenableCommand.errorCache).to.be.empty;
    });

    it('Sweeps and saves updated error cache when loading', async () => {
      getStub.resolves({ userHost: { fails: 3, last: '2020-02-02T02:02:02.000Z' } });
      await ReenableCommand.register();
      expect(ReenableCommand.errorCache).to.be.empty;
      assert.calledWithExactly(putStub, match.any, {});
    });
  });

  describe('inChannel', () => {
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      ReenableCommand.inChannel('chan');
      assert.calledOnce(hookStub);
      expect(hookStub.getCall(0).args[0]).to.equal('chan');
    });
  });

  describe('UserReenable', () => {
    let reenableCallback: any;
    let eventReplyStub: SinonStub;
    let queueUserStub: SinonStub;
    let reenableUserStub: SinonStub;
    let isInQueueStub: SinonStub;
    let isStaffStub: SinonStub;

    beforeEach(async () => {
      sandbox.stub(LevelDB, 'put');
      sandbox.stub(LevelDB, 'get').resolves({});
      await ReenableCommand.register();
      reenableCallback = hookStub.getCall(0).args[2];

      eventReplyStub = sandbox.stub();
      reenableUserStub = sandbox.stub(ABClient, 'anonymousReEnableUser');
      queueUserStub = sandbox.stub(QueueManager, 'queueUser');
      isInQueueStub = sandbox.stub(QueueManager, 'isInQueue').returns(false);
      isStaffStub = sandbox.stub(IRCClient, 'isStaff').resolves(false);
    });

    it('Does not respond if it fails to match the regex', async () => {
      await reenableCallback({ message: 'bad message', reply: eventReplyStub });
      assert.notCalled(eventReplyStub);
      assert.notCalled(reenableUserStub);
      assert.notCalled(queueUserStub);
    });

    it('Does not respond for staff', async () => {
      isStaffStub.resolves(true);
      await reenableCallback({ message: '!reenable user', reply: eventReplyStub });
      assert.notCalled(eventReplyStub);
      assert.notCalled(reenableUserStub);
      assert.notCalled(queueUserStub);
    });

    it('Does not respond for user with many failures', async () => {
      sandbox.replace(ReenableCommand, 'errorCache', { identhost: { fails: 99, last: new Date() } });
      await reenableCallback({ message: '!reenable user', ident: 'ident', hostname: 'host', reply: eventReplyStub });
      assert.notCalled(isInQueueStub);
      assert.notCalled(eventReplyStub);
      assert.notCalled(reenableUserStub);
      assert.notCalled(queueUserStub);
    });

    it('Responds and does nothing if user in queue', async () => {
      isInQueueStub.returns(true);
      await reenableCallback({ message: '!reenable user', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'You cannot reenable while in queue!');
      assert.notCalled(reenableUserStub);
      assert.notCalled(queueUserStub);
    });

    it('Responds with error if AB call fails', async () => {
      reenableUserStub.throws(new Error('Some error message'));
      await reenableCallback({ message: '!reenable user', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'Your account could not be reenabled for technical reasons. Please try again.');
    });

    it('Saves error in cache if AB failure to reenable and should not queue', async () => {
      const fakeTime = new Date();
      sandbox.useFakeTimers({ now: fakeTime, toFake: ['Date'] });
      const abErrorMsg = 'user does not exist';
      reenableUserStub.resolves({ success: false, error: abErrorMsg });
      await reenableCallback({ message: '!reenable user', ident: 'ident', hostname: 'host', reply: eventReplyStub });
      expect(ReenableCommand.errorCache?.identhost?.fails).to.equal(1);
      expect(ReenableCommand.errorCache?.identhost?.last?.getTime()).to.equal(fakeTime.getTime());
    });

    it('Responds with error from AB if failure to reenable and should not queue', async () => {
      const abErrorMsg = 'user does not exist';
      reenableUserStub.resolves({ success: false, error: abErrorMsg });
      await reenableCallback({ message: '!reenable user', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, abErrorMsg);
    });

    it('Responds with reenable message if successfully reenabled', async () => {
      sandbox.useFakeTimers({ now: new Date('2001-04-12T13:32:01.913Z'), toFake: ['Date'] });
      reenableUserStub.resolves({ success: true });
      await reenableCallback({ message: '!reenable user', reply: eventReplyStub });
      assert.calledThrice(eventReplyStub);
      assert.calledWith(
        eventReplyStub,
        'User reenabled! Welcome back user, please login by 00:00 UTC (within 10 hours from now) in order to prevent being disabled again.',
      );
      assert.calledWith(
        eventReplyStub,
        'To prevent inactivity pruning from here on, you are required to visit the site within a ten week period per cycle.',
      );
      assert.calledWith(
        eventReplyStub,
        'Reenables are a very limited service and repeat prunes will lead to permanent account closure. Please re-read the rules again: https://animebytes.tv/rules',
      );
    });

    it('Adds nick to queue and replies appropriately if could not be reenabled but should queue', async () => {
      reenableUserStub.resolves({ success: false, queue: true });
      await reenableCallback({ message: '!reenable user', nick: 'nick', reply: eventReplyStub });
      assert.calledOnceWithExactly(queueUserStub, 'nick', 'User user (https://animebytes.tv/user/profile/user) needs staff reenabling');
      assert.calledOnceWithExactly(
        eventReplyStub,
        "Your account could not be automatically reenabled! You've been added to the support queue, please wait for assistance.",
      );
    });
  });

  describe('StaffReenable', () => {
    let reenableCallback: any;
    let eventReplyStub: SinonStub;
    let reenableStaffStub: SinonStub;
    let isStaffStub: SinonStub;

    beforeEach(() => {
      ReenableCommand.inChannel('random');
      reenableCallback = hookStub.getCall(0).args[2];

      eventReplyStub = sandbox.stub();
      reenableStaffStub = sandbox.stub(ABClient, 'staffReEnableUser');
      isStaffStub = sandbox.stub(IRCClient, 'isStaff').resolves(true);

      sandbox.replace(IRCClient, 'supportSessionChannels', ['supportsessionchan']);
    });

    it('Does not respond if it fails to match the regex', async () => {
      await reenableCallback({ message: 'bad message', reply: eventReplyStub });
      assert.notCalled(eventReplyStub);
      assert.notCalled(reenableStaffStub);
      assert.notCalled(isStaffStub);
    });

    it('Does not respond if not staff', async () => {
      isStaffStub.resolves(false);
      await reenableCallback({ message: '!reenable user', hostname: 'notstaffuser', reply: eventReplyStub });
      assert.notCalled(eventReplyStub);
      assert.notCalled(reenableStaffStub);
    });

    it('Calls AB staff reenable with appropriate parameters', async () => {
      await reenableCallback({ message: '!reenable user they are cool', hostname: 'staffuser', reply: eventReplyStub });
      assert.calledOnceWithExactly(reenableStaffStub, 'user', 'staffuser', 'they are cool');
    });

    it('Responds with error if AB call fails', async () => {
      reenableStaffStub.throws(new Error('Some error message'));
      await reenableCallback({ message: '!reenable user', hostname: 'staffuser', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'Account could not be reenabled for technical reasons. Please try again.');
    });

    it('Responds with error from AB if failure to reenable', async () => {
      const abErrorMsg = 'user does not exist';
      reenableStaffStub.resolves({ success: false, error: abErrorMsg });
      await reenableCallback({ message: '!reenable user', hostname: 'staffuser', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, abErrorMsg);
    });

    it('Responds appropriately if reenabling in non-support session channel', async () => {
      reenableStaffStub.resolves({ success: true });
      await reenableCallback({ message: '!reenable user', hostname: 'staffuser', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'User reenabled!');
    });

    it('Responds appropriately if reenabling in support session channel', async () => {
      ReenableCommand.inChannel('supportsessionchan');
      reenableCallback = hookStub.getCall(1).args[2];

      sandbox.useFakeTimers({ now: new Date('2001-04-12T13:32:01.913Z'), toFake: ['Date'] });
      reenableStaffStub.resolves({ success: true });
      await reenableCallback({ message: '!reenable user', hostname: 'staffuser', reply: eventReplyStub });
      assert.calledThrice(eventReplyStub);
      assert.calledWith(
        eventReplyStub,
        'User reenabled! Welcome back user, please login by 00:00 UTC (within 10 hours from now) in order to prevent being disabled again.',
      );
      assert.calledWith(
        eventReplyStub,
        'To prevent inactivity pruning from here on, you are required to visit the site within a ten week period per cycle.',
      );
      assert.calledWith(
        eventReplyStub,
        'Reenables are a very limited service and repeat prunes will lead to permanent account closure. Please re-read the rules again: https://animebytes.tv/rules',
      );
    });
  });

  describe('shutDown', () => {
    it('Erases sweeper interval', async () => {
      const fakeInterval = setInterval(() => {}, 100);
      sandbox.replace(ReenableCommand, 'sweeper', fakeInterval);
      ReenableCommand.shutDown();
      expect(ReenableCommand.sweeper).to.be.undefined;
    });
  });
});
