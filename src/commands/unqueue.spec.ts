import { createSandbox, SinonSandbox, SinonStub, assert, match } from 'sinon';

import { UnqueueCommand } from './unqueue.js';
import { IRCClient } from '../clients/irc.js';
import { QueueManager } from '../manager/queue.js';

describe('UnqueueCommand', () => {
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
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      UnqueueCommand.register();
      assert.calledTwice(hookStub);
    });
  });

  describe('UserUnqueue', () => {
    let unqueueCallback: any;
    let eventReplyStub: SinonStub;
    let unqueueUserStub: SinonStub;
    let addUnqueuedUserStub: SinonStub;

    beforeEach(() => {
      UnqueueCommand.register();
      unqueueCallback = hookStub.getCall(0).args[2];

      eventReplyStub = sandbox.stub();
      unqueueUserStub = sandbox.stub(QueueManager, 'unqueueUserByNick');
      addUnqueuedUserStub = sandbox.stub(QueueManager, 'addUnqueuedUser');
    });

    it('Calls unqueue user on the queue for the nick', async () => {
      await unqueueCallback({ nick: 'nick', reply: eventReplyStub });
      assert.calledOnceWithExactly(unqueueUserStub, 'nick', match.any);
    });

    it('Calls addUnqueuedUser user on the queue for unqueued user', async () => {
      await unqueueCallback({ nick: 'nick', reply: eventReplyStub });
      assert.calledOnceWithExactly(addUnqueuedUserStub, 'nick');
    });

    it('Responds appropriately if successfully unqueued', async () => {
      await unqueueCallback({ nick: 'nick', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, "You've been removed from the queue!");
    });

    it('Responds appropriately if unsuccessfully unqueued', async () => {
      unqueueUserStub.throws('err');
      await unqueueCallback({ nick: 'nick', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, "You're not in the queue!");
    });
  });

  describe('StaffUnqueue', () => {
    let unqueueCallback: any;
    let eventReplyStub: SinonStub;
    let unqueueUserStub: SinonStub;
    let addUnqueuedUserStub: SinonStub;

    beforeEach(() => {
      UnqueueCommand.register();
      unqueueCallback = hookStub.getCall(1).args[2];
      eventReplyStub = sandbox.stub();
      unqueueUserStub = sandbox.stub(QueueManager, 'unqueueUserByPosition');
      addUnqueuedUserStub = sandbox.stub(QueueManager, 'addUnqueuedUser');
    });

    it('Does not respond if it fails to match the regex', async () => {
      await unqueueCallback({ message: 'badMessage', reply: eventReplyStub });
      assert.notCalled(eventReplyStub);
      assert.notCalled(unqueueUserStub);
      assert.notCalled(addUnqueuedUserStub);
    });

    it('Responds with help if no position is provided', async () => {
      await unqueueCallback({ message: '!unqueue', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'Please provide a valid position number to unqueue');
    });

    it('Responds with help if position provided is not a valid number', async () => {
      await unqueueCallback({ message: '!unqueue banana', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'Please provide a valid position number to unqueue');
    });

    it('Responds with help if position provided is not above 0', async () => {
      await unqueueCallback({ message: '!unqueue -1', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'Please provide a valid position number to unqueue');
    });

    it('Calls unqueue with a position', async () => {
      await unqueueCallback({ message: '!unqueue 2', reply: eventReplyStub });
      assert.calledOnceWithExactly(unqueueUserStub, 1);
    });

    it('Calls addUnqueuedUser user on the queue for unqueued user', async () => {
      unqueueUserStub.resolves({ nick: 'nick' });
      await unqueueCallback({ message: '!unqueue 2', reply: eventReplyStub });
      assert.calledOnceWithExactly(addUnqueuedUserStub, 'nick');
    });

    it('Responds appropriately if successfully unqueued', async () => {
      unqueueUserStub.resolves({ nick: 'nick' });
      await unqueueCallback({ message: '!unqueue 2', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'Removed nick from the queue');
    });

    it('Responds appropriately if unsuccessfully unqueued', async () => {
      unqueueUserStub.throws('err');
      await unqueueCallback({ message: '!unqueue 2', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'err');
    });
  });
});
