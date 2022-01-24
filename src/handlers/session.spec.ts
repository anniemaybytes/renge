import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { expect } from 'chai';
import mock from 'mock-fs';
import fs from 'fs';

import { IRCClient } from '../clients/irc.js';
import { LevelDB } from '../clients/leveldb.js';
import { ABClient } from '../clients/animebytes.js';
import { ReenableCommand } from '../commands/reenable.js';
import { Utils } from '../utils.js';
import { QueueManager } from '../manager/queue.js';
import { SessionHandler } from './session.js';

describe('SessionHandler', () => {
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = createSandbox();
    sandbox.replace(IRCClient, 'userSupportChan', 'chan');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('initPreviousLogs', () => {
    let mockDBGet: SinonStub;
    beforeEach(() => {
      mockDBGet = sandbox.stub(LevelDB, 'get');
      sandbox.replace(SessionHandler, 'previousLogs', []);
    });

    it('Throws error if db get fails for session keys', async () => {
      mockDBGet.throws('err');
      try {
        await SessionHandler.initPreviousLogs();
      } catch (e) {
        return;
      }
      expect.fail('Did not throw');
    });

    it('Sets previousLogs to empty array if NotFound', async () => {
      SessionHandler.previousLogs = 'garbage' as any;
      mockDBGet.throws({ type: 'NotFoundError' });
      await SessionHandler.initPreviousLogs();
      expect(SessionHandler.previousLogs).to.deep.equal([]);
    });

    it('Sets previousLogs to array from DB', async () => {
      mockDBGet.resolves([{ user: 'user', staff: 'staff', time: '2000-01-01T00:00:00.000Z', paste: 'url' }]);
      await SessionHandler.initPreviousLogs();
      expect(SessionHandler.previousLogs).to.deep.equal([{ user: 'user', staff: 'staff', time: new Date('2000-01-01T00:00:00.000Z'), paste: 'url' }]);
    });
  });

  describe('newSession', () => {
    let listenForStaffReenableInChannelStub: SinonStub;
    let addMsgHookStub: SinonStub;
    let addConnectHandlerStub: SinonStub;
    let addDisconnectHandlerStub: SinonStub;
    let addUserJoinHandlerStub: SinonStub;
    let addUserLeaveHandlerStub: SinonStub;
    let addUserRenameHandlerStub: SinonStub;

    beforeEach(() => {
      listenForStaffReenableInChannelStub = sandbox.stub(ReenableCommand, 'inChannel').returns(1 as any);
      addMsgHookStub = sandbox.stub(IRCClient, 'addMessageHookInChannel').returns(2 as any);
      addConnectHandlerStub = sandbox.stub(IRCClient, 'addConnectHandler').returns(3 as any);
      addDisconnectHandlerStub = sandbox.stub(IRCClient, 'addDisconnectHandler').returns(4 as any);
      addUserJoinHandlerStub = sandbox.stub(IRCClient, 'addUserJoinHandler').returns(5 as any);
      addUserLeaveHandlerStub = sandbox.stub(IRCClient, 'addUserLeaveHandler').returns(6 as any);
      addUserRenameHandlerStub = sandbox.stub(IRCClient, 'addUserRenameHandler').returns(7 as any);
      sandbox.stub(Utils, 'randomIRCColor').returns('blue');
    });

    it('Returns a session with correct properties set from input', () => {
      const date = new Date();
      sandbox.useFakeTimers(date);
      const cb = () => '';
      const session = SessionHandler.newSession('chan', 'staff', 'nick', 'reason', cb);
      expect(session.ircChannel).to.equal('chan');
      expect(session.staffHandlerNick).to.equal('staff');
      expect(session.userClientNick).to.equal('nick');
      expect(session.reason).to.equal('reason');
      expect(session.log).to.deep.equal([]);
      expect(session.startTime).to.equal(date.toISOString());
      expect(session.color).to.equal('blue');
      expect(session.ended).to.be.false;
      expect(session.started).to.be.false;
      expect(session.cleanupCallbacks.has(cb)).to.be.true;
    });

    it('Creates appropriate listeners and saves their cleanup callbacks', () => {
      const session = SessionHandler.newSession('chan', 'staff', 'nick', 'reason', () => '');
      assert.calledOnceWithExactly(listenForStaffReenableInChannelStub, 'chan');
      assert.calledOnce(addMsgHookStub);
      expect(addMsgHookStub.getCall(0).args[0]).to.equal('chan');
      assert.calledOnce(addConnectHandlerStub);
      assert.calledOnce(addDisconnectHandlerStub);
      assert.calledOnce(addUserJoinHandlerStub);
      assert.calledOnce(addUserLeaveHandlerStub);
      assert.calledOnce(addUserRenameHandlerStub);
      expect([1, 2, 3, 4, 5, 6, 7].every((fakeCb) => session.cleanupCallbacks.has(fakeCb as any))).to.be.true;
    });
  });

  describe('fromState', () => {
    let listenForStaffReenableInChannelStub: SinonStub;
    let addMsgHookStub: SinonStub;
    let addConnectHandlerStub: SinonStub;
    let addDisconnectHandlerStub: SinonStub;
    let addUserJoinHandlerStub: SinonStub;
    let addUserLeaveHandlerStub: SinonStub;
    let addUserRenameHandlerStub: SinonStub;
    let messageStub: SinonStub;
    let dbPutStub: SinonStub;

    beforeEach(() => {
      listenForStaffReenableInChannelStub = sandbox.stub(ReenableCommand, 'inChannel').returns(1 as any);
      addMsgHookStub = sandbox.stub(IRCClient, 'addMessageHookInChannel').returns(2 as any);
      addConnectHandlerStub = sandbox.stub(IRCClient, 'addConnectHandler').returns(3 as any);
      addDisconnectHandlerStub = sandbox.stub(IRCClient, 'addDisconnectHandler').returns(4 as any);
      addUserJoinHandlerStub = sandbox.stub(IRCClient, 'addUserJoinHandler').returns(5 as any);
      addUserLeaveHandlerStub = sandbox.stub(IRCClient, 'addUserLeaveHandler').returns(6 as any);
      addUserRenameHandlerStub = sandbox.stub(IRCClient, 'addUserRenameHandler').returns(7 as any);
      messageStub = sandbox.stub(IRCClient, 'message');
      dbPutStub = sandbox.stub(LevelDB, 'put');
      sandbox.replace(IRCClient, 'joined', false);
    });

    it('Returns a session with correct properties set from input', async () => {
      const cb = () => '';
      const session = await SessionHandler.fromState(
        {
          chan: 'chan',
          staff: 'staff',
          user: 'nick',
          reason: 'reason',
          color: 'blue',
          log: ['some', 'logs'],
          time: 'time',
        },
        cb
      );
      expect(session.ircChannel).to.equal('chan');
      expect(session.staffHandlerNick).to.equal('staff');
      expect(session.userClientNick).to.equal('nick');
      expect(session.reason).to.equal('reason');
      expect(session.log).to.deep.equal(['some', 'logs']);
      expect(session.startTime).to.equal('time');
      expect(session.color).to.equal('blue');
      expect(session.ended).to.be.false;
      expect(session.started).to.be.true;
      expect(session.cleanupCallbacks.has(cb)).to.be.true;
    });

    it('Creates appropriate listeners and saves their cleanup callbacks', async () => {
      const session = await SessionHandler.fromState(
        {
          chan: 'chan',
          staff: 'staff',
          user: 'nick',
          reason: 'reason',
          color: 'blue',
          log: ['some', 'logs'],
          time: 'time',
        },
        () => ''
      );
      assert.calledOnceWithExactly(listenForStaffReenableInChannelStub, 'chan');
      assert.calledOnce(addMsgHookStub);
      expect(addMsgHookStub.getCall(0).args[0]).to.equal('chan');
      assert.calledOnce(addConnectHandlerStub);
      assert.calledOnce(addDisconnectHandlerStub);
      assert.calledOnce(addUserJoinHandlerStub);
      assert.calledOnce(addUserLeaveHandlerStub);
      assert.calledOnce(addUserRenameHandlerStub);
      expect([1, 2, 3, 4, 5, 6, 7].every((fakeCb) => session.cleanupCallbacks.has(fakeCb as any))).to.be.true;
    });

    it('Logs a reconnect message if connected to IRC', async () => {
      sandbox.useFakeTimers(new Date('2001-01-31T03:12:26.123Z'));
      IRCClient.joined = true;
      const session = await SessionHandler.fromState(
        {
          chan: 'chan',
          staff: 'staff',
          user: 'nick',
          reason: 'reason',
          color: 'blue',
          log: ['some', 'logs'],
          time: 'time',
        },
        () => ''
      );
      assert.calledOnceWithExactly(messageStub, IRCClient.supportLogChan, '\x0312chan\x03 - --- Reconnected to IRC ---');
      expect(session.log).to.deep.equal(['some', 'logs', '2001-01-31 03:12:26 UTC | --- Reconnected to IRC ---']);
      assert.calledOnce(dbPutStub);
    });
  });

  describe('IRC handler callbacks', () => {
    let addMsgHookStub: SinonStub;
    let addConnectHandlerStub: SinonStub;
    let addDisconnectHandlerStub: SinonStub;
    let addUserJoinHandlerStub: SinonStub;
    let addUserLeaveHandlerStub: SinonStub;
    let addUserRenameHandlerStub: SinonStub;

    beforeEach(() => {
      sandbox.stub(ReenableCommand, 'inChannel').returns(1 as any);
      addMsgHookStub = sandbox.stub(IRCClient, 'addMessageHookInChannel').returns(2 as any);
      addConnectHandlerStub = sandbox.stub(IRCClient, 'addConnectHandler').returns(3 as any);
      addDisconnectHandlerStub = sandbox.stub(IRCClient, 'addDisconnectHandler').returns(4 as any);
      addUserJoinHandlerStub = sandbox.stub(IRCClient, 'addUserJoinHandler').returns(5 as any);
      addUserLeaveHandlerStub = sandbox.stub(IRCClient, 'addUserLeaveHandler').returns(6 as any);
      addUserRenameHandlerStub = sandbox.stub(IRCClient, 'addUserRenameHandler').returns(7 as any);
    });

    describe('msgHandler', () => {
      let msgHandler: any;
      let logStub: SinonStub;
      beforeEach(() => {
        const session = SessionHandler.newSession('chan', 'staff', 'nick', 'reason', () => '');
        msgHandler = addMsgHookStub.getCall(0).args[2];
        logStub = sandbox.stub(session, 'logMsg');
      });

      it('Logs the message appropriately', async () => {
        await msgHandler({ nick: 'nick', message: 'msg' });
        assert.calledOnceWithExactly(logStub, 'nick: msg');
      });
    });

    describe('disconnectHandler', () => {
      let disconnectHandler: any;
      let logStub: SinonStub;
      beforeEach(() => {
        const session = SessionHandler.newSession('chan', 'staff', 'nick', 'reason', () => '');
        disconnectHandler = addDisconnectHandlerStub.getCall(0).args[0];
        logStub = sandbox.stub(session, 'logMsg');
      });

      it('Logs a disconnect message when called', async () => {
        await disconnectHandler();
        assert.calledOnceWithExactly(logStub, '--- Disconnected from IRC ---');
      });
    });

    describe('connectHandler', () => {
      let connectHandler: any;
      let checkIfInProgressStub: SinonStub;
      beforeEach(() => {
        const session = SessionHandler.newSession('chan', 'staff', 'nick', 'reason', () => '');
        connectHandler = addConnectHandlerStub.getCall(0).args[0];
        checkIfInProgressStub = sandbox.stub(session, 'checkIfInProgress');
      });

      it('Checks if session is in progress when called', async () => {
        await connectHandler();
        assert.calledOnce(checkIfInProgressStub);
      });
    });

    describe('joinHandler', () => {
      let joinHandler: any;
      let logStub: SinonStub;
      beforeEach(() => {
        const session = SessionHandler.newSession('chan', 'staff', 'nick', 'reason', () => '');
        joinHandler = addUserJoinHandlerStub.getCall(0).args[0];
        logStub = sandbox.stub(session, 'logMsg');
      });

      it("Logs a join message when relevant for session's channel", async () => {
        await joinHandler('nick', 'chan');
        assert.calledOnceWithExactly(logStub, 'nick has joined.');
      });

      it("Does not log a join message when not relevant for session's channel", async () => {
        await joinHandler('nick', 'randomchan');
        assert.notCalled(logStub);
      });
    });

    describe('renameHandler', () => {
      let session: SessionHandler;
      let renameHandler: any;
      let logStub: SinonStub;
      beforeEach(() => {
        session = SessionHandler.newSession('chan', 'staff', 'nick', 'reason', () => '');
        renameHandler = addUserRenameHandlerStub.getCall(0).args[0];
        logStub = sandbox.stub(session, 'logMsg');
      });

      it('Updates staff nick if relevant and logs change', async () => {
        await renameHandler('staff', 'newstaffnick');
        expect(session.staffHandlerNick).to.equal('newstaffnick');
        assert.calledOnceWithExactly(logStub, 'staff has changed their nick to newstaffnick.');
      });

      it('Updates user nick if relevant and logs change', async () => {
        await renameHandler('nick', 'newnick');
        expect(session.userClientNick).to.equal('newnick');
        assert.calledOnceWithExactly(logStub, 'nick has changed their nick to newnick.');
      });

      it('Does not log if nick change was not relevant to user or staff', async () => {
        await renameHandler('random1', 'random2');
        assert.notCalled(logStub);
      });
    });

    describe('leaveHandler', () => {
      let leaveHandler: any;
      let logStub: SinonStub;
      let checkIfInProgressStub: SinonStub;
      beforeEach(() => {
        const session = SessionHandler.newSession('chan', 'staff', 'nick', 'reason', () => '');
        leaveHandler = addUserLeaveHandlerStub.getCall(0).args[0];
        logStub = sandbox.stub(session, 'logMsg');
        checkIfInProgressStub = sandbox.stub(session, 'checkIfInProgress');
      });

      it("Logs a leave message when relevant for session's channel", async () => {
        await leaveHandler('nick', 'chan', 'parted');
        assert.calledOnceWithExactly(logStub, 'nick has left (parted).');
      });

      it("Checks if session is still in progress when relevant for session's channel", async () => {
        await leaveHandler('nick', 'chan', 'parted');
        assert.calledOnce(checkIfInProgressStub);
      });

      it("Does nothing when not relevant for session's channel", async () => {
        await leaveHandler('nick', 'randomchan', 'parted');
        assert.notCalled(logStub);
        assert.notCalled(checkIfInProgressStub);
      });
    });
  });

  describe('startNewSession', () => {
    let session: SessionHandler;
    let kickUserStub: SinonStub;
    let setUpChanStub: SinonStub;
    let messageStub: SinonStub;
    let noticeStub: SinonStub;
    let joinUserToChannelStub: SinonStub;
    let logStub: SinonStub;
    beforeEach(() => {
      session = SessionHandler.newSession('chan', 'staff', 'nick', 'reason', () => '');
      sandbox.stub(IRCClient, 'isMe').returns(false);
      kickUserStub = sandbox.stub(IRCClient, 'kickUserFromChannel');
      setUpChanStub = sandbox.stub(IRCClient, 'setUpSessionChannel');
      messageStub = sandbox.stub(IRCClient, 'message');
      noticeStub = sandbox.stub(IRCClient, 'notice');
      joinUserToChannelStub = sandbox.stub(IRCClient, 'joinUserToChannel');
      logStub = sandbox.stub(session, 'logMsg');
      sandbox.replace(IRCClient, 'channelState', {});
      sandbox.replace(QueueManager, 'queue', []);
    });

    it('Kicks existing users from session channel', async () => {
      IRCClient.channelState = { chan: new Set(['someone']) };
      await session.startNewSession('ip', false);
      assert.calledWithExactly(kickUserStub.getCall(0), 'chan', 'someone');
    });

    it('Sets up session channel', async () => {
      await session.startNewSession('ip', false);
      assert.calledOnceWithExactly(setUpChanStub, session.ircChannel);
    });

    it('Sends announcement in user support channel if announce', async () => {
      await session.startNewSession('ip', true);
      assert.calledOnceWithExactly(messageStub, IRCClient.userSupportChan, 'Now helping nick.');
    });

    it('Sends announcement with next in queue if exists in user support channel if announce', async () => {
      QueueManager.queue = [{ nick: 'nextnick' }] as any;
      await session.startNewSession('ip', true);
      assert.calledOnceWithExactly(messageStub, IRCClient.userSupportChan, 'Now helping nick. Next in queue: nextnick');
    });

    it('Does not send announcement if not announce', async () => {
      await session.startNewSession('ip', false);
      assert.notCalled(messageStub);
    });

    it('Sends notice to user and staff when starting session', async () => {
      await session.startNewSession('ip', false);
      assert.calledWithExactly(noticeStub.getCall(0), 'staff', 'Starting support session for nick in chan, user IP: ip');
      assert.calledWithExactly(noticeStub.getCall(1), 'nick', 'nick, you are now being helped by staff in chan');
    });

    it('Kicks user from support channel', async () => {
      await session.startNewSession('ip', false);
      assert.calledOnceWithExactly(kickUserStub, 'chan', 'nick');
    });

    it('Joins user and staff to support chanel', async () => {
      await session.startNewSession('ip', false);
      assert.calledWithExactly(joinUserToChannelStub.getCall(0), 'chan', 'staff');
      assert.calledWithExactly(joinUserToChannelStub.getCall(1), 'chan', 'nick');
    });

    it('Logs a beginning message', async () => {
      await session.startNewSession('ip', false);
      assert.calledOnceWithExactly(logStub, 'Beginning support conversation between nick and staff in chan. Reason: reason');
    });

    it('Sets session as started if complete', async () => {
      expect(session.started).to.be.false;
      await session.startNewSession('ip', false);
      expect(session.started).to.be.true;
    });

    it('Throws an internal error if something goes wrong', async () => {
      joinUserToChannelStub.throws('err');
      try {
        await session.startNewSession('ip', false);
      } catch (e) {
        expect(`${e}`).to.equal('Error: Internal Error');
        expect(session.started).to.be.false;
        return;
      }
      expect.fail('Did not throw');
    });
  });

  describe('logMsg', () => {
    let session: SessionHandler;
    let messageStub: SinonStub;
    let saveStub: SinonStub;
    beforeEach(() => {
      session = SessionHandler.newSession('chan', 'staff', 'nick', 'reason', () => '');
      messageStub = sandbox.stub(IRCClient, 'message');
      saveStub = sandbox.stub(session, 'saveToState');
    });

    it('Adds to log and saves to state', async () => {
      const date = new Date('2001-09-12T18:58:43.123Z');
      sandbox.useFakeTimers(date);
      await session.logMsg('msg');
      expect(session.log).to.deep.equal(['2001-09-12 18:58:43 UTC | msg']);
      assert.calledOnce(saveStub);
    });

    it('Sends message to log channel with colored channel name and spacing nicks', async () => {
      session.color = 'blue';
      await session.logMsg('nick: hi staff');
      assert.calledOnceWithExactly(messageStub, IRCClient.supportLogChan, '\x0312chan\x03 - nick: hi s\u200Bt\u200Ba\u200Bf\u200Bf');
    });

    it('Does not throw if failure to send message to log channel', async () => {
      messageStub.throws('err');
      await session.logMsg('msg');
    });
  });

  describe('checkIfInProgress', () => {
    let session: SessionHandler;
    let endStub: SinonStub;
    beforeEach(() => {
      session = SessionHandler.newSession('chan', 'staff', 'nick', 'reason', () => '');
      session.started = true;
      endStub = sandbox.stub(session, 'endSession');
      sandbox.replace(IRCClient, 'channelState', { chan: new Set([]) });
    });

    it('Ends session if staff is no longer in channel', async () => {
      IRCClient.channelState['chan'] = new Set(['nick']);
      await session.checkIfInProgress();
      assert.calledOnce(endStub);
    });

    it('Ends session if user is no longer in channel', async () => {
      IRCClient.channelState['chan'] = new Set(['staff']);
      await session.checkIfInProgress();
      assert.calledOnce(endStub);
    });

    it('Does nothing if the session has not yet started', async () => {
      session.started = false;
      IRCClient.channelState['chan'] = new Set(['staff']);
      await session.checkIfInProgress();
      assert.notCalled(endStub);
    });

    it('Does nothing if staff and user are still in channel', async () => {
      IRCClient.channelState['chan'] = new Set(['nick', 'staff']);
      await session.checkIfInProgress();
      assert.notCalled(endStub);
    });
  });

  describe('endSession', () => {
    let session: SessionHandler;
    let createPasteStub: SinonStub;
    let messageStub: SinonStub;
    let kickUserStub: SinonStub;
    let putStub: SinonStub;
    let deleteStub: SinonStub;
    const fakeTime = new Date('2000-01-01T00:00:00.000Z');
    beforeEach(() => {
      sandbox.useFakeTimers(fakeTime);
      session = SessionHandler.newSession('chan', 'staff', 'nick', 'reason', () => '');
      session.started = true;
      sandbox.stub(IRCClient, 'isMe').returns(false);
      kickUserStub = sandbox.stub(IRCClient, 'kickUserFromChannel');
      createPasteStub = sandbox.stub(ABClient, 'createPaste').resolves('pasteURL');
      messageStub = sandbox.stub(IRCClient, 'message');
      putStub = sandbox.stub(LevelDB, 'put');
      deleteStub = sandbox.stub(LevelDB, 'delete');
      sandbox.replace(SessionHandler, 'logsDir', 'logs');
      sandbox.replace(SessionHandler, 'previousLogs', []);
      mock({
        'logs/chan 2000-01-01T00:00:00.000Z nick staff.log': '',
      });
      sandbox.replace(IRCClient, 'channelState', {});
    });

    afterEach(() => {
      mock.restore();
    });

    it('Does nothing if already ended', async () => {
      session.ended = true;
      await session.endSession();
      assert.notCalled(createPasteStub);
      assert.notCalled(messageStub);
      assert.notCalled(deleteStub);
    });

    it('Only ends once if called multiple times', async () => {
      await Promise.all([session.endSession(), session.endSession(), session.endSession(), session.endSession()]);
      assert.calledOnce(createPasteStub);
      assert.calledOnce(messageStub);
      assert.calledOnce(deleteStub);
    });

    it('Saves serialized log to disk', async () => {
      session.log = ['one', 'two'];
      await session.endSession();
      expect(await fs.promises.readFile('logs/chan 2000-01-01T00:00:00.000Z nick staff.log', 'utf8')).to.equal('one\ntwo');
    });

    it('Does not throw if writing to file fails', async () => {
      sandbox.stub(fs.promises, 'writeFile').throws('err');
      await session.endSession();
    });

    it('Uploads log as paste', async () => {
      session.log = ['one', 'two'];
      await session.endSession();
      assert.calledOnce(createPasteStub);
      expect(createPasteStub.getCall(0).args[0]).to.equal('chan 2000-01-01T00:00:00.000Z nick staff.log');
      expect(createPasteStub.getCall(0).args[1]).to.equal('one\ntwo');
    });

    it('Appends session logs to previousLogs and saves to state', async () => {
      await session.endSession();
      assert.calledOnceWithExactly(putStub, 'sessions::previousLogs', SessionHandler.previousLogs);
      expect(SessionHandler.previousLogs).to.deep.equal([{ user: 'nick', staff: 'staff', time: fakeTime, paste: 'pasteURL' }]);
    });

    it('Trims previousLogs down to only 10 if necessary', async () => {
      SessionHandler.previousLogs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as any;
      await session.endSession();
      expect(SessionHandler.previousLogs.length).to.equal(10);
    });

    it('Does not throw if writing to DB fails', async () => {
      putStub.throws('err');
      await session.endSession();
    });

    it('Sends end message with paste url in log channel', async () => {
      await session.endSession();
      assert.calledOnceWithExactly(
        messageStub,
        IRCClient.supportLogChan,
        'Support conversation in chan between nick and s\u200Bt\u200Ba\u200Bf\u200Bf complete. A log can be found at pasteURL'
      );
    });

    it('Sends end message without paste url in log channel if paste upload failed', async () => {
      createPasteStub.throws('err');
      await session.endSession();
      assert.calledOnceWithExactly(
        messageStub,
        IRCClient.supportLogChan,
        'Support conversation in chan between nick and s\u200Bt\u200Ba\u200Bf\u200Bf complete. I could not properly upload the logs, but they should be saved locally.'
      );
    });

    it('Does not throw if messaging log channel fails', async () => {
      messageStub.throws('err');
      await session.endSession();
    });

    it('Does not create log, paste, or send completion message if session never started', async () => {
      session.started = false;
      await session.endSession();
      expect(await fs.promises.readFile('logs/chan 2000-01-01T00:00:00.000Z nick staff.log', 'utf8')).to.equal('');
      assert.notCalled(createPasteStub);
      assert.notCalled(messageStub);
    });

    it('Kicks users from the support channel', async () => {
      IRCClient.channelState['chan'] = new Set(['randomnick']);
      await session.endSession();
      assert.calledOnceWithExactly(kickUserStub, 'chan', 'randomnick');
    });

    it('Calls cleanup callbacks', async () => {
      const fakeCB = sandbox.stub();
      session.cleanupCallbacks = new Set([fakeCB]);
      await session.endSession();
      assert.calledOnce(fakeCB);
    });

    it('Does not throw if callback errors', async () => {
      const fakeCB = sandbox.stub();
      fakeCB.throws('err');
      session.cleanupCallbacks = new Set([fakeCB]);
      await session.endSession();
    });

    it('Deletes session from state in DB', async () => {
      await session.endSession();
      assert.calledOnceWithExactly(deleteStub, 'session::chan');
    });

    it('Does not throw if deleting from state fails', async () => {
      deleteStub.throws('err');
      await session.endSession();
    });

    it('Sets the session as ended', async () => {
      await session.endSession();
      expect(session.ended).to.be.true;
    });
  });

  describe('saveToState', () => {
    let session: SessionHandler;
    let dbPutStub: SinonStub;
    const fakeTime = new Date();
    beforeEach(() => {
      sandbox.useFakeTimers(fakeTime);
      session = SessionHandler.newSession('chan', 'staff', 'nick', 'reason', () => '');
      dbPutStub = sandbox.stub(LevelDB, 'put');
    });

    it('Saves to database with expected parameters', async () => {
      session.color = 'blue';
      await session.saveToState();
      assert.calledOnceWithExactly(dbPutStub, 'session::chan', {
        chan: 'chan',
        staff: 'staff',
        user: 'nick',
        reason: 'reason',
        time: fakeTime.toISOString(),
        color: 'blue',
        log: [],
      });
    });
  });
});
