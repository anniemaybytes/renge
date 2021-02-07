import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { listenForStaffLogs } from './logs';
import { IRCClient } from '../clients/irc';
import { SessionHandler } from '../handlers/sessionHandler';

describe('Logs', () => {
  let sandbox: SinonSandbox;
  let hookStub: SinonStub;

  beforeEach(() => {
    sandbox = createSandbox();
    hookStub = sandbox.stub(IRCClient, 'addMessageHookInChannel');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('listenForStaffLogs', () => {
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      listenForStaffLogs();
      assert.calledOnce(hookStub);
    });
  });

  describe('StaffLogs', () => {
    let logsCallback: any;
    let eventReply: SinonStub;

    beforeEach(() => {
      listenForStaffLogs();
      logsCallback = hookStub.getCall(0).args[2];
      eventReply = sandbox.stub();
      sandbox.replace(SessionHandler, 'previousLogs', []);
    });

    it('Responds with appropriate error if no previous logs', async () => {
      await logsCallback({ reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'No previous logs found!');
    });

    it('Responds with previous logs appropriately', async () => {
      const time = new Date('2001-01-01T00:00:00.824Z');
      SessionHandler.previousLogs = [
        { user: 'nick1', staff: 'staff1', time, paste: 'url1' },
        { user: 'nick2', staff: 'staff2', time, paste: 'url2' },
      ];
      await logsCallback({ reply: eventReply });
      assert.calledTwice(eventReply);
      assert.calledWithExactly(
        eventReply.getCall(0),
        '1. Conversation between nick1 and s\u200Bt\u200Ba\u200Bf\u200Bf\u200B1 at 2001-01-01 00:00:00 UTC: url1'
      );
      assert.calledWithExactly(
        eventReply.getCall(1),
        '2. Conversation between nick2 and s\u200Bt\u200Ba\u200Bf\u200Bf\u200B2 at 2001-01-01 00:00:00 UTC: url2'
      );
    });
  });
});
