import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { listenForStaffUnqueue, listenForUserUnqueue } from './unqueue';
import { IRCClient } from '../clients/irc';
import { SupportQueue } from '../handlers/supportQueue';

describe('Unqueue', () => {
  let sandbox: SinonSandbox;
  let hookStub: SinonStub;

  beforeEach(() => {
    sandbox = createSandbox();
    hookStub = sandbox.stub(IRCClient, 'addMessageHookInChannel');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('listenForStaffUnqueue', () => {
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      listenForStaffUnqueue();
      assert.calledOnce(hookStub);
    });
  });

  describe('listenForUserUnqueue', () => {
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      listenForUserUnqueue();
      assert.calledOnce(hookStub);
    });
  });

  describe('unqueue [user]', () => {
    let unqueueCallback: any;
    let eventReply: SinonStub;
    let unqueueUserStub: SinonStub;
    let addUnqueuedUserStub: SinonStub;

    beforeEach(() => {
      listenForUserUnqueue();
      unqueueCallback = hookStub.getCall(0).args[2];
      eventReply = sandbox.stub();
      unqueueUserStub = sandbox.stub(SupportQueue, 'unqueueUser');
      addUnqueuedUserStub = sandbox.stub(SupportQueue, 'addUnqueuedUser');
    });

    it('Calls unqueue user on the queue for the nick', async () => {
      await unqueueCallback({ nick: 'nick', reply: eventReply });
      assert.calledOnceWithExactly(unqueueUserStub, undefined, 'nick');
    });

    it('Calls addUnqueuedUser user on the queue for unqueued user', async () => {
      await unqueueCallback({ nick: 'nick', reply: eventReply });
      assert.calledOnceWithExactly(addUnqueuedUserStub, 'nick');
    });

    it('Responds appropriately if successfully unqueued', async () => {
      await unqueueCallback({ nick: 'nick', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, "You've been removed from the queue!");
    });

    it('Responds appropriately if unsuccessfully unqueued', async () => {
      unqueueUserStub.throws('err');
      await unqueueCallback({ nick: 'nick', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, "You're not in the queue!");
    });
  });

  describe('unqueue [staff]', () => {
    let unqueueCallback: any;
    let eventReply: SinonStub;
    let unqueueUserStub: SinonStub;
    let addUnqueuedUserStub: SinonStub;

    beforeEach(() => {
      listenForStaffUnqueue();
      unqueueCallback = hookStub.getCall(0).args[2];
      eventReply = sandbox.stub();
      unqueueUserStub = sandbox.stub(SupportQueue, 'unqueueUser');
      addUnqueuedUserStub = sandbox.stub(SupportQueue, 'addUnqueuedUser');
    });

    it('Does not respond if it fails to match the regex', async () => {
      await unqueueCallback({ message: 'badMessage', reply: eventReply });
      assert.notCalled(eventReply);
      assert.notCalled(unqueueUserStub);
      assert.notCalled(addUnqueuedUserStub);
    });

    it('Responds with help if no position is provided', async () => {
      await unqueueCallback({ message: '!unqueue', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'Provide either a position to unqueue');
    });

    it('Responds with help if position provided is not a valid number', async () => {
      await unqueueCallback({ message: '!unqueue banana', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'Please provide a valid position number to unqueue');
    });

    it('Responds with help if position provided is not above 0', async () => {
      await unqueueCallback({ message: '!unqueue -1', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'Please provide a valid position number to unqueue');
    });

    it('Calls unqueue with a position', async () => {
      await unqueueCallback({ message: '!unqueue 2', reply: eventReply });
      assert.calledOnceWithExactly(unqueueUserStub, 1);
    });

    it('Calls addUnqueuedUser user on the queue for unqueued user', async () => {
      unqueueUserStub.resolves({ nick: 'nick' });
      await unqueueCallback({ message: '!unqueue 2', reply: eventReply });
      assert.calledOnceWithExactly(addUnqueuedUserStub, 'nick');
    });

    it('Responds appropriately if successfully unqueued', async () => {
      unqueueUserStub.resolves({ nick: 'nick' });
      await unqueueCallback({ message: '!unqueue 2', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'Removed nick from the queue');
    });

    it('Responds appropriately if unsuccessfully unqueued', async () => {
      unqueueUserStub.throws('err');
      await unqueueCallback({ message: '!unqueue 2', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'err');
    });
  });
});
