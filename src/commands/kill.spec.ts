import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { KillCommand } from './kill.js';
import { IRCClient } from '../clients/irc.js';
import { SessionManager } from '../manager/session.js';

describe('KillCommand', () => {
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
      KillCommand.register();
      assert.calledOnce(hookStub);
    });
  });

  describe('StaffKill', () => {
    let killCallback: any;
    let eventReplyStub: SinonStub;
    let fakeSession: any;

    beforeEach(() => {
      KillCommand.register();
      killCallback = hookStub.getCall(0).args[2];

      eventReplyStub = sandbox.stub();
      fakeSession = { ircChannel: 'chan', ended: false, endSession: sandbox.stub() };
      sandbox.replace(SessionManager, 'activeSupportSessions', {});
    });

    it('Does not respond if it fails to match the regex', async () => {
      await killCallback({ message: 'badMessage', reply: eventReplyStub });
      assert.notCalled(eventReplyStub);
    });

    it('Responds with appropriate error if active session with provided name not found', async () => {
      await killCallback({ message: '!kill badchan', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'badchan is not a valid active session!');
    });

    it('Calls endSession and responds correctly for matching sessions', async () => {
      SessionManager.activeSupportSessions['chan'] = fakeSession;
      await killCallback({ message: '!kill chan', reply: eventReplyStub });
      assert.calledOnce(fakeSession.endSession);
      assert.calledOnceWithExactly(eventReplyStub, 'chan session has been ended');
    });

    it('Responds with error if ending session fails', async () => {
      SessionManager.activeSupportSessions['chan'] = fakeSession;
      fakeSession.endSession.throws('err');
      await killCallback({ message: '!kill chan', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'There was an unexpected error killing the session. Please try again');
    });
  });
});
