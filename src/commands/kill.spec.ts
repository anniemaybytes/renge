import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { listenForStaffKill } from './kill';
import { IRCClient } from '../clients/irc';
import { SessionManager } from '../handlers/sessionManager';

describe('Kill', () => {
  let sandbox: SinonSandbox;
  let hookStub: SinonStub;

  beforeEach(() => {
    sandbox = createSandbox();
    hookStub = sandbox.stub(IRCClient, 'addMessageHookInChannel');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('listenForStaffKill', () => {
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      listenForStaffKill();
      assert.calledOnce(hookStub);
    });
  });

  describe('StaffKill', () => {
    let killCallback: any;
    let eventReply: SinonStub;
    let fakeSession: any;

    beforeEach(() => {
      listenForStaffKill();
      killCallback = hookStub.getCall(0).args[2];
      eventReply = sandbox.stub();
      fakeSession = { ircChannel: 'chan', ended: false, endSession: sandbox.stub() };
      sandbox.replace(SessionManager, 'activeSupportSessions', {});
    });

    it('Does not respond if it fails to match the regex', async () => {
      await killCallback({ message: 'badMessage', reply: eventReply });
      assert.notCalled(eventReply);
    });

    it('Responds with appropriate error if active session with provided name not found', async () => {
      await killCallback({ message: '!kill badchan', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'badchan is not a valid active session!');
    });

    it('Calls endSession and responds correctly for matching sessions', async () => {
      SessionManager.activeSupportSessions['chan'] = fakeSession;
      await killCallback({ message: '!kill chan', reply: eventReply });
      assert.calledOnce(fakeSession.endSession);
      assert.calledOnceWithExactly(eventReply, 'chan session has been ended');
    });

    it('Responds with error if ending session fails', async () => {
      SessionManager.activeSupportSessions['chan'] = fakeSession;
      fakeSession.endSession.throws('err');
      await killCallback({ message: '!kill chan', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'There was an unexpected error killing the session. Please try again');
    });
  });
});
