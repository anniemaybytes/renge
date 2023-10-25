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

    beforeEach(() => {
      HandleCommand.register();
      handleCallback = hookStub.getCall(0).args[2];

      eventReplyStub = sandbox.stub();
      startSupportSessionStub = sandbox.stub(SessionManager, 'startSupportSession');
    });

    it('Does not respond if it fails to match the regex', async () => {
      await handleCallback({ message: 'bad message', reply: eventReplyStub });
      assert.notCalled(eventReplyStub);
      assert.notCalled(startSupportSessionStub);
    });

    it('Starts a new support session with appropriate parameters when manually specifying nick and reason', async () => {
      await handleCallback({ message: '!handle nick reason', nick: 'staff', reply: eventReplyStub });
      assert.calledOnceWithExactly(startSupportSessionStub, 'nick', 'staff', false, 'reason', 'N/A');
    });

    it('Responds with error if there was a failure to start a new support session when manually specifying nick and reason', async () => {
      startSupportSessionStub.throws({ name: 'Error', message: 'Stub error message for testing purposes' });
      await handleCallback({ message: '!handle nick reason', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'Stub error message for testing purposes');
    });

    it('Responds with help if position specified is not a valid number', async () => {
      await handleCallback({ message: '!handle banana', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'Please provide a valid position number to handle');
    });

    it('Responds with help if position specified is not above 0', async () => {
      await handleCallback({ message: '!handle -1', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'Please provide a valid position number to handle');
    });

    it('Responds with error if no users are in queue', async () => {
      await handleCallback({ message: '!handle', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'No users are in the queue!');
    });

    it('Responds with error if user at specified position is not in queue', async () => {
      sandbox.replace(QueueManager, 'queue', [{ nick: 'one' } as any]);
      await handleCallback({ message: '!handle 2', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'Only 1 user is in the queue!');
    });

    it('Calls startSupportSession with appropriate parameters with user from position', async () => {
      sandbox.replace(QueueManager, 'queue', [{}, { nick: 'nick', reason: 'reason', ip: 'ip' } as any]);
      await handleCallback({ message: '!handle 2', nick: 'staff', reply: eventReplyStub });
      assert.calledOnceWithExactly(startSupportSessionStub, 'nick', 'staff', true, 'reason', 'ip');
    });
  });
});
