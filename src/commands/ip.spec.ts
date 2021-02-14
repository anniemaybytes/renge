import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { listenForStaffIP } from './ip';
import { IRCClient } from '../clients/irc';
import { QueueManager } from '../handlers/queueManager';
import { SessionManager } from '../handlers/sessionManager';

describe('IP', () => {
  let sandbox: SinonSandbox;
  let hookStub: SinonStub;

  beforeEach(() => {
    sandbox = createSandbox();
    hookStub = sandbox.stub(IRCClient, 'addMessageHookInChannel');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('listenForStaffIP', () => {
    it('Calls addMessageHookInChannel on the IRC bot', () => {
      listenForStaffIP();
      assert.calledOnce(hookStub);
    });
  });

  describe('StaffIp', () => {
    let ipCallback: any;
    let eventReply: SinonStub;
    let isInQueueStub: SinonStub;
    let whoisStub: SinonStub;
    let noticeStub: SinonStub;

    beforeEach(() => {
      listenForStaffIP();
      ipCallback = hookStub.getCall(0).args[2];
      eventReply = sandbox.stub();
      isInQueueStub = sandbox.stub(QueueManager, 'isInQueue').returns(true);
      whoisStub = sandbox.stub(IRCClient, 'whois').resolves({ actual_ip: 'ip' } as any);
      noticeStub = sandbox.stub(IRCClient, 'notice');
      sandbox.replace(SessionManager, 'activeSupportSessions', {});
    });

    it('Does not respond if it fails to match the regex', async () => {
      await ipCallback({ message: 'badMessage', reply: eventReply });
      assert.notCalled(whoisStub);
      assert.notCalled(eventReply);
      assert.notCalled(noticeStub);
    });

    it('Responds with appropriate error if requested nick is not in queue or active session', async () => {
      isInQueueStub.returns(false);
      await ipCallback({ message: '!ip nick', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'nick is not in the queue nor in an active session!');
      assert.notCalled(whoisStub);
      assert.notCalled(noticeStub);
    });

    it("Sends NOTICE to requesting nick with requested nick's IP if nick is in the queue", async () => {
      await ipCallback({ message: '!ip nick', nick: 'staff', reply: eventReply });
      assert.calledOnceWithExactly(whoisStub, 'nick');
      assert.calledOnceWithExactly(noticeStub, 'staff', "nick's IP is ip");
    });

    it("Sends NOTICE to requesting nick with requested nick's IP if nick is in an active session", async () => {
      isInQueueStub.returns(false);
      SessionManager.activeSupportSessions['chan'] = { ended: false, userClientNick: 'Nick' } as any;
      await ipCallback({ message: '!ip nick', nick: 'staff', reply: eventReply });
      assert.calledOnceWithExactly(whoisStub, 'nick');
      assert.calledOnceWithExactly(noticeStub, 'staff', "nick's IP is ip");
    });

    it('Responds with an error if unexpected error', async () => {
      whoisStub.throws('err');
      await ipCallback({ message: '!ip nick', reply: eventReply });
      assert.calledOnceWithExactly(eventReply, 'An internal error has occured, please notify sysop');
    });
  });
});
