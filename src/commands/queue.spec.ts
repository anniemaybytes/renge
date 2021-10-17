import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { listenForStaffQueue, listenForUserQueue } from './queue';
import { IRCClient } from '../clients/irc';
import { QueueManager } from '../handlers/queueManager';

describe('Queue', () => {
  let sandbox: SinonSandbox;
  let hookStub: SinonStub;

  beforeEach(() => {
    sandbox = createSandbox();
    hookStub = sandbox.stub(IRCClient, 'addMessageHookInChannel');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('listenForStaffQueue', () => {
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      listenForStaffQueue();
      assert.calledOnce(hookStub);
    });
  });

  describe('listenForUserQueue', () => {
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      listenForUserQueue();
      assert.calledOnce(hookStub);
    });
  });

  describe('UserQueue', () => {
    let queueCallback: any;
    let eventReply: SinonStub;
    let queueUserStub: SinonStub;
    let isStaffStub: SinonStub;
    let isOpStub: SinonStub;

    beforeEach(() => {
      listenForUserQueue();
      queueCallback = hookStub.getCall(0).args[2];
      eventReply = sandbox.stub();
      queueUserStub = sandbox.stub(QueueManager, 'queueUser');
      isStaffStub = sandbox.stub(IRCClient, 'isStaff').resolves(false);
      isOpStub = sandbox.stub(IRCClient, 'isChannelOp').resolves(false);
    });

    it('Does not respond if it fails to match the regex', async () => {
      await queueCallback({ message: 'badMessage', reply: eventReply });
      assert.notCalled(eventReply);
      assert.notCalled(queueUserStub);
    });

    it('Does not respond if user is staff', async () => {
      isStaffStub.resolves(true);
      await queueCallback({ message: 'badMessage', reply: eventReply });
      assert.notCalled(eventReply);
      assert.notCalled(queueUserStub);
    });

    it('Does not respond if user is channel OP', async () => {
      isOpStub.resolves(true);
      await queueCallback({ message: 'badMessage', reply: eventReply });
      assert.notCalled(eventReply);
      assert.notCalled(queueUserStub);
    });

    it('Responds with help if no reason provided', async () => {
      await queueCallback({ message: '!queue', reply: eventReply });
      assert.calledOnceWithExactly(
        eventReply,
        'If you need your account re-enabled please type !reenable <your username>. Otherwise please enter the support queue with !queue <reason you need assistance>.'
      );
      assert.notCalled(queueUserStub);
    });

    it('Responds with help if provided reason is too long', async () => {
      await queueCallback({
        message:
          '!queue some dumb long reason that is waaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaay too long to be typing',
        reply: eventReply,
      });
      assert.calledOnceWithExactly(eventReply, 'Sorry, your reason is a bit too long. Mind cutting it down to 140 characters and trying again?');
      assert.notCalled(queueUserStub);
    });

    it('Queues user with correct parameters', async () => {
      await queueCallback({ message: '!queue  my reason', nick: 'someone', reply: eventReply });
      assert.calledOnceWithExactly(queueUserStub, 'someone', 'my reason');
    });

    it('Replies appropriately if newly queued', async () => {
      queueUserStub.resolves(true);
      await queueCallback({ message: '!queue  my reason', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, "You've been added to the queue!");
    });

    it('Replies appropriately if already queued', async () => {
      queueUserStub.resolves(false);
      await queueCallback({ message: '!queue  my reason', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, "You're already in the queue! If you'd like to leave just type !unqueue or part the channel.");
    });

    it('Replies with an error if the queueing fails', async () => {
      queueUserStub.throws('err');
      await queueCallback({ message: '!queue  my reason', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'An error has occured, please try again later');
    });
  });

  describe('StaffQueue', () => {
    let queueCallback: any;
    let eventReply: SinonStub;

    beforeEach(() => {
      listenForStaffQueue();
      queueCallback = hookStub.getCall(0).args[2];
      eventReply = sandbox.stub();
      sandbox.useFakeTimers(new Date('1999-01-01T05:30:00.001Z'));
    });

    it('Replies appropriately with an empty queue', async () => {
      sandbox.replace(QueueManager, 'queue', []);
      await queueCallback({ reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'No users are queued!');
    });

    it('Replies correctly with users in the queue', async () => {
      sandbox.replace(QueueManager, 'queue', [
        { nick: 'n1', time: new Date('1999-01-01T05:30:00.000Z'), reason: 'r1' } as any,
        { nick: 'n2', time: new Date('1999-01-01T05:29:00.000Z'), reason: 'r2' } as any,
        { nick: 'n3', time: new Date('1999-01-01T05:28:00.000Z'), reason: 'r3' } as any,
        { nick: 'n4', time: new Date('1999-01-01T04:30:00.000Z'), reason: 'r4' } as any,
        { nick: 'n5', time: new Date('1999-01-01T03:30:00.000Z') } as any,
      ]);
      await queueCallback({ reply: eventReply });
      assert.calledWith(eventReply.getCall(0), '1. n1 - r1 - just now');
      assert.calledWith(eventReply.getCall(1), '2. n2 - r2 - a minute ago');
      assert.calledWith(eventReply.getCall(2), '3. n3 - r3 - 2 minutes ago');
      assert.calledWith(eventReply.getCall(3), '4. n4 - r4 - one hour ago');
      assert.calledWith(eventReply.getCall(4), '5. n5 - 2 hours ago');
    });
  });
});
