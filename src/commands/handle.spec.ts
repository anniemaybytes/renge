import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';

import { HandleCommand } from './handle.js';
import { IRCClient } from '../clients/irc.js';
import { SessionManager } from '../manager/session.js';
import { QueueManager } from '../manager/queue.js';

describe('HandleCommand', () => {
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
      HandleCommand.register();
      assert.calledOnce(hookStub);
    });
  });

  describe('handle', () => {
    let handleCallback: any;
    let eventReplyStub: SinonStub;
    let startSupportSessionStub: SinonStub;
    let unqueueUserStub: SinonStub;

    beforeEach(() => {
      HandleCommand.register();
      handleCallback = hookStub.getCall(0).args[2];

      eventReplyStub = sandbox.stub();
      startSupportSessionStub = sandbox.stub(SessionManager, 'startSupportSession');
      unqueueUserStub = sandbox.stub(QueueManager, 'unqueueUser').resolves({} as any);
    });

    it('Does not respond if it fails to match the regex', async () => {
      await handleCallback({ message: 'badMessage', reply: eventReplyStub });
      assert.notCalled(eventReplyStub);
      assert.notCalled(unqueueUserStub);
      assert.notCalled(startSupportSessionStub);
    });

    it('Starts a new support session with appropriate parameters when manually specifying nick and reason', async () => {
      await handleCallback({ message: '!handle nick reason', nick: 'staff', reply: eventReplyStub });
      assert.calledOnceWithExactly(startSupportSessionStub, 'nick', 'staff', false, 'reason', 'N/A');
    });

    it('Responds with error if there was a failure to start a new support session when manually specifying nick and reason', async () => {
      startSupportSessionStub.throws('err');
      await handleCallback({ message: '!handle nick reason', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'err');
    });

    it('Attempts to unqueue user after successfully starting support session when manually specifying nick and reason', async () => {
      unqueueUserStub.throws('err'); // should be able to handle a bad unqueue gracefully
      await handleCallback({ message: '!handle nick reason', reply: eventReplyStub });
      assert.calledOnceWithExactly(unqueueUserStub, undefined, 'nick');
    });

    it('Calls unqueueUser user on the queue for first position if no position specified', async () => {
      await handleCallback({ message: '!handle', reply: eventReplyStub });
      assert.calledOnceWithExactly(unqueueUserStub, 0);
    });

    it('Responds with help if position specified is not a valid number', async () => {
      await handleCallback({ message: '!handle banana', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'Please provide a valid position number to handle');
    });

    it('Responds with help if position specified is not above 0', async () => {
      await handleCallback({ message: '!handle -1', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'Please provide a valid position number to handle');
    });

    it('Calls unqueueUser user on the queue for the specified position', async () => {
      await handleCallback({ message: '!handle 2', reply: eventReplyStub });
      assert.calledOnceWithExactly(unqueueUserStub, 1);
    });

    it('Calls startSupportSession with appropriate parameters if successfully unqueued with position', async () => {
      unqueueUserStub.resolves({ nick: 'nick', reason: 'reason', ip: 'ip' });
      await handleCallback({ message: '!handle 2', nick: 'staff', reply: eventReplyStub });
      assert.calledOnceWithExactly(startSupportSessionStub, 'nick', 'staff', true, 'reason', 'ip');
    });

    it('Responds appropriately if unsuccessfully unqueued with position', async () => {
      unqueueUserStub.throws('err');
      await handleCallback({ message: '!handle 2', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'err');
    });
  });
});
