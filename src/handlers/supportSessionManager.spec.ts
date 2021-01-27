import { expect } from 'chai';
import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { SupportSessionManager } from './supportSessionManager';
import { SupportSession } from './supportSession';
import { IRCClient } from '../clients/irc';
import { LevelDB } from '../clients/leveldb';

describe('SupportSessionManager', () => {
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('initSessionManager', () => {
    let mockSupportSession: any;
    let mockDBGet: SinonStub;
    let mockFromState: SinonStub;
    let isMeStub: SinonStub;
    let kickUserStub: SinonStub;
    beforeEach(() => {
      sandbox.replace(IRCClient, 'supportSessionChannels', []);
      sandbox.replace(SupportSessionManager, 'activeSupportSessions', {});
      mockSupportSession = { checkIfInProgress: sandbox.stub() };
      mockDBGet = sandbox.stub(LevelDB, 'get').resolves([]);
      mockFromState = sandbox.stub(SupportSession, 'fromState').resolves(mockSupportSession);
      isMeStub = sandbox.stub(IRCClient, 'isMe').returns(false);
      kickUserStub = sandbox.stub(IRCClient, 'kickUserFromChannel');
    });

    it('throws error if db get fails for session keys', async () => {
      mockDBGet.throws('err');
      try {
        await SupportSessionManager.initSessionManager();
      } catch (e) {
        return;
      }
      expect.fail('did not throw');
    });

    it('does not throw if db get fails with not found', async () => {
      mockDBGet.throws({ type: 'NotFoundError' });
      await SupportSessionManager.initSessionManager();
    });

    it('gets subsequent keys from active sessions in db', async () => {
      mockDBGet.onFirstCall().returns(['key1']);
      await SupportSessionManager.initSessionManager();
      assert.calledWithExactly(mockDBGet.getCall(0), 'sessions::activeSessions');
      assert.calledWithExactly(mockDBGet.getCall(1), 'key1');
    });

    it('throws error if db get fails for session', async () => {
      mockDBGet.onFirstCall().returns(['key1']);
      mockDBGet.onSecondCall().throws('err');
      try {
        await SupportSessionManager.initSessionManager();
      } catch (e) {
        return;
      }
      expect.fail('did not throw');
    });

    it('creates session from state with correct params and checks if it is in progress', async () => {
      const sessionData = { chan: 'chan' };
      mockDBGet.onFirstCall().returns(['key1']);
      mockDBGet.onSecondCall().returns(sessionData);
      await SupportSessionManager.initSessionManager();
      expect(mockFromState.getCall(0).args[0]).to.deep.equal(sessionData);
      assert.calledOnce(mockSupportSession.checkIfInProgress);
    });

    it('kicks users from support session channels that are not active', async () => {
      IRCClient.supportSessionChannels = ['chan'];
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['nick']) });
      await SupportSessionManager.initSessionManager();
      assert.calledOnceWithExactly(isMeStub, 'nick');
      assert.calledOnceWithExactly(kickUserStub, 'chan', 'nick');
    });
  });

  describe('startSupportSession', () => {
    let mockNewSession: SinonStub;
    let saveStateStub: SinonStub;
    let mockSession: any;
    beforeEach(() => {
      mockSession = { startNewSession: sandbox.stub(), endSession: sandbox.stub() };
      mockNewSession = sandbox.stub(SupportSession, 'newSession').returns(mockSession);
      saveStateStub = sandbox.stub(SupportSessionManager, 'saveToState');
      sandbox.replace(IRCClient, 'supportSessionChannels', ['chan']);
      sandbox.replace(SupportSessionManager, 'activeSupportSessions', {});
    });

    it('throws error if no available support channels', async () => {
      SupportSessionManager.activeSupportSessions = { chan: {} as any };
      try {
        await SupportSessionManager.startSupportSession('nick', 'staff', true, 'reason', 'ip');
      } catch (e) {
        return;
      }
      expect.fail('did not throw');
    });

    it('creates and starts a new session with correct params', async () => {
      await SupportSessionManager.startSupportSession('nick', 'staff', true, 'reason', 'ip');
      expect(mockNewSession.getCall(0).args[0]).to.equal('chan');
      expect(mockNewSession.getCall(0).args[1]).to.equal('staff');
      expect(mockNewSession.getCall(0).args[2]).to.equal('nick');
      expect(mockNewSession.getCall(0).args[3]).to.equal('reason');
      assert.calledOnceWithExactly(mockSession.startNewSession, 'ip', true);
    });

    it('provides callback to SupportSession which removes from active sessions and saves state', async () => {
      await SupportSessionManager.startSupportSession('nick', 'staff', true, 'reason', 'ip');
      const deleteCallback = mockNewSession.getCall(0).args[4];
      expect(SupportSessionManager.activeSupportSessions['chan']).to.not.be.undefined;
      deleteCallback();
      assert.calledTwice(saveStateStub);
      expect(SupportSessionManager.activeSupportSessions['chan']).to.be.undefined;
    });

    it('calls endSession and throws an error without saving state if starting new session fails', async () => {
      mockSession.startNewSession.throws('err');
      try {
        await SupportSessionManager.startSupportSession('nick', 'staff', true, 'reason', 'ip');
      } catch (e) {
        assert.calledOnce(mockSession.endSession);
        assert.notCalled(saveStateStub);
        return;
      }
      expect.fail('did not throw');
    });

    it('saves state after starting a new session', async () => {
      await SupportSessionManager.startSupportSession('nick', 'staff', true, 'reason', 'ip');
      assert.calledOnceWithExactly(mockSession.startNewSession, 'ip', true);
      assert.calledOnce(saveStateStub);
    });

    it('throws an error if saving fails', async () => {
      saveStateStub.throws('err');
      try {
        await SupportSessionManager.startSupportSession('nick', 'staff', true, 'reason', 'ip');
      } catch (e) {
        return;
      }
      expect.fail('did not throw');
    });
  });

  describe('saveToState', () => {
    let dbPushStub: SinonStub;
    beforeEach(() => {
      dbPushStub = sandbox.stub(LevelDB, 'put');
    });

    it('Saves active session db keys to db', async () => {
      sandbox.replace(SupportSessionManager, 'activeSupportSessions', { chan: { ended: false, dbKey: () => 'key' }, chan2: { ended: true } } as any);
      await SupportSessionManager.saveToState();
      assert.calledOnceWithExactly(dbPushStub, 'sessions::activeSessions', ['key']);
    });
  });
});
