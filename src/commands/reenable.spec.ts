import { expect } from 'chai';
import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { listenForUserReenable, listenForStaffReenable, listenForStaffReenableInChannel } from './reenable';
import { IRCClient } from '../clients/irc';
import { ABClient } from '../clients/animebytes';
import { QueueManager } from '../handlers/queueManager';

describe('Reenable', () => {
  let sandbox: SinonSandbox;
  let hookStub: SinonStub;

  beforeEach(() => {
    sandbox = createSandbox();
    hookStub = sandbox.stub(IRCClient, 'addMessageHookInChannel');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('listenForUserReenable', () => {
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      listenForUserReenable();
      assert.calledOnce(hookStub);
    });
  });

  describe('listenForStaffReenable', () => {
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      listenForStaffReenable();
      assert.calledOnce(hookStub);
    });
  });

  describe('listenForStaffReenableInChannel', () => {
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      listenForStaffReenableInChannel('chan');
      assert.calledOnce(hookStub);
      expect(hookStub.getCall(0).args[0]).to.equal('chan');
    });
  });

  describe('UserReenable', () => {
    let reenableCallback: any;
    let eventReply: SinonStub;
    let queueUserStub: SinonStub;
    let reenableUserStub: SinonStub;
    let isStaffStub: SinonStub;

    beforeEach(() => {
      listenForUserReenable();
      reenableCallback = hookStub.getCall(0).args[2];
      eventReply = sandbox.stub();
      reenableUserStub = sandbox.stub(ABClient, 'anonymousReEnableUser');
      queueUserStub = sandbox.stub(QueueManager, 'queueUser');
      isStaffStub = sandbox.stub(IRCClient, 'isStaff').resolves(false);
    });

    it('Does not respond if it fails to match the regex', async () => {
      await reenableCallback({ message: 'badMessage', reply: eventReply });
      assert.notCalled(eventReply);
      assert.notCalled(reenableUserStub);
      assert.notCalled(queueUserStub);
    });

    it('Does not respond for staff', async () => {
      isStaffStub.resolves(true);
      await reenableCallback({ message: '!reenable user', reply: eventReply });
      assert.notCalled(eventReply);
      assert.notCalled(reenableUserStub);
      assert.notCalled(queueUserStub);
    });

    it('Responds with error if AB call fails', async () => {
      reenableUserStub.throws('err');
      await reenableCallback({ message: '!reenable user', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'Your account could not be reenabled for technical reasons. Please try again.');
    });

    it('Responds with error from AB if failure to reenable and should not queue', async () => {
      const abErrorMsg = 'user does not exist';
      reenableUserStub.resolves({ success: false, error: abErrorMsg });
      await reenableCallback({ message: '!reenable user', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, abErrorMsg);
    });

    it('Responds with reenable message if successfully reenabled', async () => {
      sandbox.useFakeTimers(new Date('2001-04-12T13:32:01.913Z'));
      reenableUserStub.resolves({ success: true });
      await reenableCallback({ message: '!reenable user', reply: eventReply });
      assert.calledThrice(eventReply);
      assert.calledWith(
        eventReply,
        'User reenabled! Welcome back user, please login by 00:00 UTC (within 10 hours from now) in order to prevent being disabled again.'
      );
      assert.calledWith(
        eventReply,
        'To prevent inactivity pruning from here on, you are required to visit the site within a ten week period per cycle.'
      );
      assert.calledWith(
        eventReply,
        'Reenables are a very limited service and repeat prunes will lead to permanent account closure. Please re-read the rules again: https://animebytes.tv/rules'
      );
    });

    it('Adds nick to queue and replies appropriately if could not be reenabled but should queue', async () => {
      reenableUserStub.resolves({ success: false, queue: true });
      await reenableCallback({ message: '!reenable user', nick: 'nick', reply: eventReply });
      assert.calledOnceWithExactly(queueUserStub, 'nick', 'User user (https://animebytes.tv/user/profile/user) needs staff reenabling');
      assert.calledOnceWithExactly(
        eventReply,
        "Your account could not be automatically reenabled! You've been added to the support queue, please wait for assistance."
      );
    });
  });

  describe('StaffReenable', () => {
    let reenableCallback: any;
    let eventReply: SinonStub;
    let reenableStaffStub: SinonStub;
    let isStaffStub: SinonStub;

    beforeEach(() => {
      sandbox.replace(IRCClient, 'supportSessionChannels', ['supportsessionchan']);
      listenForStaffReenableInChannel('random');
      reenableCallback = hookStub.getCall(0).args[2];
      eventReply = sandbox.stub();
      reenableStaffStub = sandbox.stub(ABClient, 'staffReEnableUser');
      isStaffStub = sandbox.stub(IRCClient, 'isStaff').resolves(true);
    });

    it('Does not respond if it fails to match the regex', async () => {
      await reenableCallback({ message: 'badMessage', reply: eventReply });
      assert.notCalled(eventReply);
      assert.notCalled(reenableStaffStub);
      assert.notCalled(isStaffStub);
    });

    it('Does not respond if not staff', async () => {
      isStaffStub.resolves(false);
      await reenableCallback({ message: '!reenable user', hostname: 'staffuser', reply: eventReply });
      assert.notCalled(eventReply);
      assert.notCalled(reenableStaffStub);
    });

    it('Calls AB staff reenable with appropriate parameters', async () => {
      await reenableCallback({ message: '!reenable user they are cool', hostname: 'staffuser', reply: eventReply });
      assert.calledOnceWithExactly(reenableStaffStub, 'user', 'staffuser', 'they are cool');
    });

    it('Responds with error if AB call fails', async () => {
      reenableStaffStub.throws('err');
      await reenableCallback({ message: '!reenable user', hostname: 'staffuser', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'Account could not be reenabled for technical reasons. Please try again.');
    });

    it('Responds with error from AB if failure to reenable', async () => {
      const abErrorMsg = 'user does not exist';
      reenableStaffStub.resolves({ success: false, error: abErrorMsg });
      await reenableCallback({ message: '!reenable user', hostname: 'staffuser', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, abErrorMsg);
    });

    it('Responds appropriately if reenabling in non-support session channel', async () => {
      reenableStaffStub.resolves({ success: true });
      await reenableCallback({ message: '!reenable user', hostname: 'staffuser', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'User reenabled!');
    });

    it('Responds appropriately if reenabling in support session channel', async () => {
      listenForStaffReenableInChannel('supportsessionchan');
      reenableCallback = hookStub.getCall(1).args[2];
      sandbox.useFakeTimers(new Date('2001-04-12T13:32:01.913Z'));
      reenableStaffStub.resolves({ success: true });
      await reenableCallback({ message: '!reenable user', hostname: 'staffuser', reply: eventReply });
      assert.calledThrice(eventReply);
      assert.calledWith(
        eventReply,
        'User reenabled! Welcome back user, please login by 00:00 UTC (within 10 hours from now) in order to prevent being disabled again.'
      );
      assert.calledWith(
        eventReply,
        'To prevent inactivity pruning from here on, you are required to visit the site within a ten week period per cycle.'
      );
      assert.calledWith(
        eventReply,
        'Reenables are a very limited service and repeat prunes will lead to permanent account closure. Please re-read the rules again: https://animebytes.tv/rules'
      );
    });
  });
});
