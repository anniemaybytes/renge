import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { listenForStaffHandle } from './handle';
import { IRCClient } from '../clients/irc';
import { SessionManager } from '../handlers/sessionManager';
import { QueueManager } from '../handlers/queueManager';

describe('Handle', () => {
  let sandbox: SinonSandbox;
  let hookStub: SinonStub;

  beforeEach(() => {
    sandbox = createSandbox();
    hookStub = sandbox.stub(IRCClient, 'addMessageHookInChannel');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('listenForStaffHandle', () => {
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      listenForStaffHandle();
      assert.calledOnce(hookStub);
    });
  });

  describe('handle', () => {
    let handleCallback: any;
    let eventReply: SinonStub;
    let startSupportSessionStub: SinonStub;
    let unqueueUserStub: SinonStub;

    beforeEach(() => {
      listenForStaffHandle();
      handleCallback = hookStub.getCall(0).args[2];
      eventReply = sandbox.stub();
      startSupportSessionStub = sandbox.stub(SessionManager, 'startSupportSession');
      unqueueUserStub = sandbox.stub(QueueManager, 'unqueueUser').resolves({} as any);
    });

    it('Does not respond if it fails to match the regex', async () => {
      await handleCallback({ message: 'badMessage', reply: eventReply });
      assert.notCalled(eventReply);
      assert.notCalled(unqueueUserStub);
      assert.notCalled(startSupportSessionStub);
    });

    it('Starts a new support session with appropriate parameters when manually specifying nick and reason', async () => {
      await handleCallback({ message: '!handle nick reason', nick: 'staff', reply: eventReply });
      assert.calledOnceWithExactly(startSupportSessionStub, 'nick', 'staff', false, 'reason', 'N/A');
    });

    it('Responds with error if there was a failure to start a new support session when manually specifying nick and reason', async () => {
      startSupportSessionStub.throws('err');
      await handleCallback({ message: '!handle nick reason', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'err');
    });

    it('Attempts to unqueue user after successfully starting support session when manually specifying nick and reason', async () => {
      unqueueUserStub.throws('err'); // should be able to handle a bad unqueue gracefully
      await handleCallback({ message: '!handle nick reason', reply: eventReply });
      assert.calledOnceWithExactly(unqueueUserStub, undefined, 'nick');
    });

    it('Calls unqueueUser user on the queue for first position if no position specified', async () => {
      await handleCallback({ message: '!handle', reply: eventReply });
      assert.calledOnceWithExactly(unqueueUserStub, 0);
    });

    it('Responds with help if position specified is not a valid number', async () => {
      await handleCallback({ message: '!handle banana', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'Please provide a valid position number to handle');
    });

    it('Responds with help if position specified is not above 0', async () => {
      await handleCallback({ message: '!handle -1', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'Please provide a valid position number to handle');
    });

    it('Calls unqueueUser user on the queue for the specified position', async () => {
      await handleCallback({ message: '!handle 2', reply: eventReply });
      assert.calledOnceWithExactly(unqueueUserStub, 1);
    });

    it('Calls startSupportSession with appropriate parameters if successfully unqueued with position', async () => {
      unqueueUserStub.resolves({ nick: 'nick', reason: 'reason', ip: 'ip' });
      await handleCallback({ message: '!handle 2', nick: 'staff', reply: eventReply });
      assert.calledOnceWithExactly(startSupportSessionStub, 'nick', 'staff', true, 'reason', 'ip');
    });

    it('Responds appropriately if unsuccessfully unqueued with position', async () => {
      unqueueUserStub.throws('err');
      await handleCallback({ message: '!handle 2', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'err');
    });
  });
});
