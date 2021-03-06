import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { listenForStaffSessions } from './sessions';
import { IRCClient } from '../clients/irc';
import { SessionManager } from '../handlers/sessionManager';

describe('Sessions', () => {
  let sandbox: SinonSandbox;
  let hookStub: SinonStub;

  beforeEach(() => {
    sandbox = createSandbox();
    hookStub = sandbox.stub(IRCClient, 'addMessageHookInChannel');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('listenForStaffSessions', () => {
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      listenForStaffSessions();
      assert.calledOnce(hookStub);
    });
  });

  describe('StaffSessions', () => {
    let sessionsCallback: any;
    let eventReply: SinonStub;

    beforeEach(() => {
      listenForStaffSessions();
      sessionsCallback = hookStub.getCall(0).args[2];
      eventReply = sandbox.stub();
      sandbox.replace(SessionManager, 'activeSupportSessions', {});
    });

    it('Responds with no active sessions if no sessions', async () => {
      SessionManager.activeSupportSessions['chan'] = { ended: true } as any;
      await sessionsCallback({ reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'No active sessions');
    });

    it('Responds with a list of valid active sessions', async () => {
      SessionManager.activeSupportSessions['chan1'] = {
        ended: false,
        ircChannel: 'chan1',
        staffHandlerNick: 'staff1',
        userClientNick: 'user1',
        color: 'blue',
        startTime: '2000-01-01T00:00:00.000Z',
        reason: 'reason',
      } as any;
      SessionManager.activeSupportSessions['chan2'] = {
        ended: false,
        ircChannel: 'chan2',
        staffHandlerNick: 'staff2',
        userClientNick: 'user2',
        color: 'blue',
        startTime: '2000-01-01T00:00:00.000Z',
        reason: 'reason',
      } as any;
      await sessionsCallback({ reply: eventReply });
      assert.calledTwice(eventReply);
      assert.calledWith(
        eventReply,
        '\x0312chan1\x03 - s\u200Bt\u200Ba\u200Bf\u200Bf\u200B1 helping user1 started 2000-01-01 00:00:00 UTC reason: reason'
      );
      assert.calledWith(
        eventReply,
        '\x0312chan2\x03 - s\u200Bt\u200Ba\u200Bf\u200Bf\u200B2 helping user2 started 2000-01-01 00:00:00 UTC reason: reason'
      );
    });
  });
});
