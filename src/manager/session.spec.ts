import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { expect } from 'chai';

import { SessionManager } from './session.js';
import { SessionHandler } from '../handlers/session.js';
import { IRCClient } from '../clients/irc.js';
import { LevelDB } from '../clients/leveldb.js';

describe('SessionManager', () => {
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('start', () => {
    let mockSupportSession: any;
    let mockDBGet: SinonStub;
    let initPreviousLogs: SinonStub;
    let mockFromState: SinonStub;
    let isMeStub: SinonStub;
    let kickUserStub: SinonStub;
    beforeEach(() => {
      sandbox.replace(IRCClient, 'supportSessionChannels', []);
      sandbox.replace(SessionManager, 'activeSupportSessions', {});
      mockSupportSession = { checkIfInProgress: sandbox.stub() };
      mockDBGet = sandbox.stub(LevelDB, 'get').resolves([]);
      initPreviousLogs = sandbox.stub(SessionHandler, 'initPreviousLogs');
      mockFromState = sandbox.stub(SessionHandler, 'fromState').resolves(mockSupportSession);
      isMeStub = sandbox.stub(IRCClient, 'isMe').returns(false);
      kickUserStub = sandbox.stub(IRCClient, 'partUserFromChannel');
    });

    it('Calls initPreviousLogs on SupportSession', async () => {
      await SessionManager.start();
      assert.calledOnce(initPreviousLogs);
    });

    it('Throws error if db get fails for session keys', async () => {
      mockDBGet.throws(new Error('Some error message'));
      try {
        await SessionManager.start();
      } catch {
        return;
      }
      expect.fail('Did not throw');
    });

    it('Does not throw if db get fails with not found', async () => {
      mockDBGet.throws({ code: 'LEVEL_NOT_FOUND' });
      await SessionManager.start();
    });

    it('Gets subsequent keys from active sessions in db', async () => {
      mockDBGet.onFirstCall().returns(['key1']);
      await SessionManager.start();
      assert.calledWithExactly(mockDBGet.getCall(0), 'sessions::activeSessions');
      assert.calledWithExactly(mockDBGet.getCall(1), 'key1');
    });

    it('Throws error if db get fails for session', async () => {
      mockDBGet.onFirstCall().returns(['key1']);
      mockDBGet.onSecondCall().throws(new Error('Some error message'));
      try {
        await SessionManager.start();
      } catch {
        return;
      }
      expect.fail('Did not throw');
    });

    it('Creates session from state with correct parameters and checks if it is in progress', async () => {
      const sessionData = { chan: 'chan' };
      mockDBGet.onFirstCall().returns(['key1']);
      mockDBGet.onSecondCall().returns(sessionData);
      await SessionManager.start();
      expect(mockFromState.getCall(0).args[0]).to.deep.equal(sessionData);
      assert.calledOnce(mockSupportSession.checkIfInProgress);
    });

    it('Kicks users from support session channels that are not active', async () => {
      IRCClient.supportSessionChannels = ['chan'];
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['nick']) });
      await SessionManager.start();
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
      mockNewSession = sandbox.stub(SessionHandler, 'newSession').returns(mockSession);
      saveStateStub = sandbox.stub(SessionManager, 'saveToState');
      sandbox.replace(IRCClient, 'supportSessionChannels', ['chan']);
      sandbox.replace(SessionManager, 'activeSupportSessions', {});
    });

    it('Throws error if no available support channels', async () => {
      SessionManager.activeSupportSessions = { chan: {} as any };
      try {
        await SessionManager.startSupportSession('nick', 'staff', true, 'reason', 'ip');
      } catch {
        return;
      }
      expect.fail('Did not throw');
    });

    it('Creates and starts a new session with correct parameters', async () => {
      await SessionManager.startSupportSession('nick', 'staff', true, 'reason', 'ip');
      expect(mockNewSession.getCall(0).args[0]).to.equal('chan');
      expect(mockNewSession.getCall(0).args[1]).to.equal('staff');
      expect(mockNewSession.getCall(0).args[2]).to.equal('nick');
      expect(mockNewSession.getCall(0).args[3]).to.equal('reason');
      assert.calledOnceWithExactly(mockSession.startNewSession, 'ip', true);
    });

    it('Provides callback to SessionHandler which removes from active sessions and saves state', async () => {
      await SessionManager.startSupportSession('nick', 'staff', true, 'reason', 'ip');
      const deleteCallback = mockNewSession.getCall(0).args[4];
      expect(SessionManager.activeSupportSessions['chan']).to.not.be.undefined;
      deleteCallback();
      assert.calledTwice(saveStateStub);
      expect(SessionManager.activeSupportSessions['chan']).to.be.undefined;
    });

    it('Calls endSession and throws an error without saving state if starting new session fails', async () => {
      mockSession.startNewSession.throws(new Error('Some error message'));
      try {
        await SessionManager.startSupportSession('nick', 'staff', true, 'reason', 'ip');
      } catch {
        assert.calledOnce(mockSession.endSession);
        assert.notCalled(saveStateStub);
        return;
      }
      expect.fail('Did not throw');
    });

    it('Saves state after starting a new session', async () => {
      await SessionManager.startSupportSession('nick', 'staff', true, 'reason', 'ip');
      assert.calledOnceWithExactly(mockSession.startNewSession, 'ip', true);
      assert.calledOnce(saveStateStub);
    });

    it('Throws an error if saving fails', async () => {
      saveStateStub.throws(new Error('Some error message'));
      try {
        await SessionManager.startSupportSession('nick', 'staff', true, 'reason', 'ip');
      } catch {
        return;
      }
      expect.fail('Did not throw');
    });
  });

  describe('saveToState', () => {
    let dbPushStub: SinonStub;
    beforeEach(() => {
      dbPushStub = sandbox.stub(LevelDB, 'put');
    });

    it('Saves active session db keys to db', async () => {
      sandbox.replace(SessionManager, 'activeSupportSessions', { chan: { ended: false, dbKey: () => 'key' }, chan2: { ended: true } } as any);
      await SessionManager.saveToState();
      assert.calledOnceWithExactly(dbPushStub, 'sessions::activeSessions', ['key']);
    });
  });
});
