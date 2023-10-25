import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';

import { IPCommand } from './ip.js';
import { IRCClient } from '../clients/irc.js';
import { QueueManager } from '../manager/queue.js';
import { SessionManager } from '../manager/session.js';

describe('IPCommand', () => {
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
      IPCommand.register();
      assert.calledOnce(hookStub);
    });
  });

  describe('StaffIp', () => {
    let ipCallback: any;
    let eventReplyStub: SinonStub;
    let isInQueueStub: SinonStub;
    let whoisStub: SinonStub;
    let noticeStub: SinonStub;

    beforeEach(() => {
      IPCommand.register();
      ipCallback = hookStub.getCall(0).args[2];

      eventReplyStub = sandbox.stub();
      isInQueueStub = sandbox.stub(QueueManager, 'isInQueue').returns(true);
      whoisStub = sandbox.stub(IRCClient, 'whois').resolves({ actual_ip: 'ip' } as any);
      noticeStub = sandbox.stub(IRCClient, 'notice');

      sandbox.replace(SessionManager, 'activeSupportSessions', {});
    });

    it('Does not respond if it fails to match the regex', async () => {
      await ipCallback({ message: 'bad message', reply: eventReplyStub });
      assert.notCalled(whoisStub);
      assert.notCalled(eventReplyStub);
      assert.notCalled(noticeStub);
    });

    it('Responds with appropriate error if requested nick is not in queue or active session', async () => {
      isInQueueStub.returns(false);
      await ipCallback({ message: '!ip nick', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'nick is not in the queue nor in an active session!');
      assert.notCalled(whoisStub);
      assert.notCalled(noticeStub);
    });

    it("Sends NOTICE to requesting nick with requested nick's IP if nick is in the queue", async () => {
      await ipCallback({ message: '!ip nick', nick: 'staff', reply: eventReplyStub });
      assert.calledOnceWithExactly(whoisStub, 'nick');
      assert.calledOnceWithExactly(noticeStub, 'staff', "nick's IP is ip");
    });

    it("Sends NOTICE to requesting nick with requested nick's IP if nick is in an active session", async () => {
      isInQueueStub.returns(false);
      SessionManager.activeSupportSessions['chan'] = { ended: false, userClientNick: 'Nick' } as any;
      await ipCallback({ message: '!ip nick', nick: 'staff', reply: eventReplyStub });
      assert.calledOnceWithExactly(whoisStub, 'nick');
      assert.calledOnceWithExactly(noticeStub, 'staff', "nick's IP is ip");
    });

    it('Responds with an error if unexpected error', async () => {
      whoisStub.throws(new Error('Some error message'));
      await ipCallback({ message: '!ip nick', reply: eventReplyStub });
      assert.calledOnceWithExactly(eventReplyStub, 'An internal error has occured, please notify sysop');
    });
  });
});
