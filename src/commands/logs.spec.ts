import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';

import { LogsCommand } from './logs.js';
import { IRCClient } from '../clients/irc.js';
import { SessionHandler } from '../handlers/session.js';

describe('LogsCommand', () => {
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
      LogsCommand.register();
      assert.calledOnce(hookStub);
    });
  });

  describe('StaffLogs', () => {
    let logsCallback: any;
    let eventReplyStub: SinonStub;

    beforeEach(() => {
      LogsCommand.register();
      logsCallback = hookStub.getCall(0).args[2];

      eventReplyStub = sandbox.stub();
      sandbox.replace(SessionHandler, 'previousLogs', []);
    });

    it('Responds with appropriate error if no previous logs', async () => {
      await logsCallback({ reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'No previous logs found!');
    });

    it('Responds with previous logs appropriately', async () => {
      const time = new Date('2001-01-01T00:00:00.824Z');
      SessionHandler.previousLogs = [
        { user: 'nick1', staff: 'staff1', time, paste: 'url1' },
        { user: 'nick2', staff: 'staff2', time, paste: 'url2' },
      ];
      await logsCallback({ reply: eventReplyStub });
      assert.calledTwice(eventReplyStub);
      assert.calledWithExactly(
        eventReplyStub.getCall(0),
        '1. Conversation between nick1 and s\u200Bt\u200Ba\u200Bf\u200Bf\u200B1 at 2001-01-01 00:00:00 UTC: url1'
      );
      assert.calledWithExactly(
        eventReplyStub.getCall(1),
        '2. Conversation between nick2 and s\u200Bt\u200Ba\u200Bf\u200Bf\u200B2 at 2001-01-01 00:00:00 UTC: url2'
      );
    });
  });
});
