import { expect } from 'chai';
import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { IRCClient } from '../clients/irc';
import { LevelDB } from '../clients/leveldb';
import * as utils from '../utils';
import { SupportQueue } from './supportQueue';

describe('SupportQueue', () => {
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = createSandbox();
    sandbox.replace(IRCClient, 'userSupportChan', 'chan');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('isInQueue', () => {
    it('returns false if nick is not in queue', () => {
      sandbox.replace(SupportQueue, 'queue', []);
      expect(SupportQueue.isInQueue('nick')).to.be.false;
    });

    it('returns true if nick is in queue', () => {
      sandbox.replace(SupportQueue, 'queue', [{ nick: 'Nick' } as any]);
      expect(SupportQueue.isInQueue('nick')).to.be.true;
    });
  });

  describe('initQueue', () => {
    let mockDBGet: SinonStub;
    let mockAddRename: SinonStub;
    let mockAddJoin: SinonStub;
    let mockAddLeave: SinonStub;
    let mockAddDisconnect: SinonStub;
    let mockAddConnect: SinonStub;
    beforeEach(() => {
      sandbox.replace(SupportQueue, 'queue', []);
      mockDBGet = sandbox.stub(LevelDB, 'get').resolves([{ nick: 'nick', reason: 'reason', time: '2000-01-01T00:00:00.000Z', ip: 'ip' }]);
      mockAddRename = sandbox.stub(IRCClient, 'addUserRenameHandler');
      mockAddJoin = sandbox.stub(IRCClient, 'addUserJoinHandler');
      mockAddLeave = sandbox.stub(IRCClient, 'addUserLeaveHandler');
      mockAddDisconnect = sandbox.stub(IRCClient, 'addDisconnectHandler');
      mockAddConnect = sandbox.stub(IRCClient, 'addConnectHandler');
    });

    it('loads queue from db state', async () => {
      await SupportQueue.initQueue();
      assert.calledOnceWithExactly(mockDBGet, 'queue::queuedUsers');
      expect(SupportQueue.queue).to.deep.equal([{ nick: 'nick', reason: 'reason', time: new Date('2000-01-01T00:00:00.000Z'), ip: 'ip' }]);
    });

    it('sets queue to empty if db get throws not found', async () => {
      mockDBGet.throws({ type: 'NotFoundError' });
      await SupportQueue.initQueue();
      expect(SupportQueue.queue).to.deep.equal([]);
    });

    it('throws if there was an error loading from the db', async () => {
      mockDBGet.throws('err');
      try {
        await SupportQueue.initQueue();
      } catch (e) {
        return;
      }
      expect.fail('did not throw');
    });

    it('adds IRC user rename handler', async () => {
      await SupportQueue.initQueue();
      assert.calledOnceWithExactly(mockAddRename, SupportQueue.renameUser);
    });

    it('adds IRC user join handler', async () => {
      await SupportQueue.initQueue();
      assert.calledOnceWithExactly(mockAddJoin, SupportQueue.userJoinHandler);
    });

    it('adds IRC user leave handler which does nothing if not support channel', async () => {
      const unqueueUserStub = sandbox.stub(SupportQueue, 'unqueueUser');
      await SupportQueue.initQueue();
      assert.calledOnce(mockAddLeave);
      await mockAddLeave.getCall(0).args[0]('nick', 'randomchan');
      assert.notCalled(unqueueUserStub);
    });

    it('adds IRC user leave handler which removes queued/unqueued user', async () => {
      const unqueueUserStub = sandbox.stub(SupportQueue, 'unqueueUser');
      sandbox.replace(SupportQueue, 'unqueuedUsers', { nick: setTimeout(() => '', 0) });
      await SupportQueue.initQueue();
      assert.calledOnce(mockAddLeave);
      await mockAddLeave.getCall(0).args[0]('nick', 'chan');
      assert.calledOnce(unqueueUserStub);
      expect(SupportQueue.unqueuedUsers).to.deep.equal({});
    });

    it('adds IRC disconnect handler which removes all unqueued users', async () => {
      sandbox.replace(SupportQueue, 'unqueuedUsers', { nick: setTimeout(() => '', 0) });
      await SupportQueue.initQueue();
      assert.calledOnce(mockAddDisconnect);
      mockAddDisconnect.getCall(0).args[0]();
      expect(SupportQueue.unqueuedUsers).to.deep.equal({});
    });

    it('adds IRC connect handler', async () => {
      await SupportQueue.initQueue();
      assert.calledOnceWithExactly(mockAddConnect, SupportQueue.nowConnected);
    });
  });

  describe('nowConnected', () => {
    let mockDBPut: SinonStub;
    let mockIsMe: SinonStub;
    let mockInQueue: SinonStub;
    let mockAddUnqueuedUser: SinonStub;
    beforeEach(() => {
      mockDBPut = sandbox.stub(LevelDB, 'put');
      mockIsMe = sandbox.stub(IRCClient, 'isMe').returns(false);
      mockInQueue = sandbox.stub(SupportQueue, 'isInQueue').returns(false);
      mockAddUnqueuedUser = sandbox.stub(SupportQueue, 'addUnqueuedUser');
    });

    it('keeps users in queue who are still in the support channel', async () => {
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['nick']) });
      sandbox.replace(SupportQueue, 'queue', [{ nick: 'nick' }, { nick: 'left' } as any]);
      await SupportQueue.nowConnected();
      expect(SupportQueue.queue).to.deep.equal([{ nick: 'nick' }]);
    });

    it('saves queue to state', async () => {
      await SupportQueue.nowConnected();
      assert.calledOnceWithExactly(mockDBPut, 'queue::queuedUsers', []);
    });

    it('adds users who are in support channel but not in the queue as unqueued', async () => {
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['nick']) });
      await SupportQueue.nowConnected();
      assert.calledOnce(mockIsMe);
      assert.calledOnceWithExactly(mockInQueue, 'nick');
      assert.calledOnceWithExactly(mockAddUnqueuedUser, 'nick');
    });

    it('does not add self to unqueued users', async () => {
      mockIsMe.returns(true);
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['me']) });
      await SupportQueue.nowConnected();
      assert.notCalled(mockAddUnqueuedUser);
    });
  });

  describe('userJoinHandler', () => {
    let isStaffStub: SinonStub;
    let messageStub: SinonStub;
    let addUnqueuedUserStub: SinonStub;
    beforeEach(() => {
      isStaffStub = sandbox.stub(IRCClient, 'isStaff').resolves(false);
      messageStub = sandbox.stub(IRCClient, 'message');
      addUnqueuedUserStub = sandbox.stub(SupportQueue, 'addUnqueuedUser');
      sandbox.stub(utils, 'sleep');
    });

    it('does nothing if not support channel', async () => {
      await SupportQueue.userJoinHandler('nick', 'randomchan');
      assert.notCalled(isStaffStub);
      assert.notCalled(messageStub);
      assert.notCalled(addUnqueuedUserStub);
    });

    it('does nothing if staff', async () => {
      isStaffStub.resolves(true);
      await SupportQueue.userJoinHandler('nick', 'chan');
      assert.notCalled(messageStub);
      assert.notCalled(addUnqueuedUserStub);
    });

    it('sends welcome message to IRC user support channel', async () => {
      await SupportQueue.userJoinHandler('nick', 'chan');
      assert.calledOnceWithExactly(
        messageStub,
        'chan',
        'Hi nick! If you need your account re-enabled please type !reenable <your username>. Otherwise please enter the support queue with !queue <reason you need assistance>.'
      );
    });

    it('adds new joined user as unqueued', async () => {
      await SupportQueue.userJoinHandler('nick', 'chan');
      assert.calledOnceWithExactly(addUnqueuedUserStub, 'nick');
    });
  });

  describe('addUnqueuedUser', () => {
    let isStaffStub: SinonStub;
    let isChannelOp: SinonStub;
    let messageStub: SinonStub;
    let kickUserStub: SinonStub;
    beforeEach(() => {
      isStaffStub = sandbox.stub(IRCClient, 'isStaff').resolves(false);
      isChannelOp = sandbox.stub(IRCClient, 'isChannelOp').resolves(false);
      messageStub = sandbox.stub(IRCClient, 'message');
      kickUserStub = sandbox.stub(IRCClient, 'kickUserFromChannel');
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['nick']) });
      sandbox.replace(SupportQueue, 'unqueuedUsers', {});
    });

    it('does nothing if nick not in support channel', async () => {
      IRCClient.channelState['chan'] = new Set();
      await SupportQueue.addUnqueuedUser('nick');
      expect(SupportQueue.unqueuedUsers).to.deep.equal({});
    });

    it('does nothing if staff', async () => {
      isStaffStub.resolves(true);
      await SupportQueue.addUnqueuedUser('nick');
      expect(SupportQueue.unqueuedUsers).to.deep.equal({});
    });

    it('does nothing if channel op', async () => {
      isChannelOp.resolves(true);
      await SupportQueue.addUnqueuedUser('nick');
      expect(SupportQueue.unqueuedUsers).to.deep.equal({});
    });

    it('adds an unqueued user timeout', async () => {
      await SupportQueue.addUnqueuedUser('nick');
      expect(SupportQueue.unqueuedUsers['nick']).to.not.be.undefined;
    });

    it('send warning message to user after 5 minutes', async () => {
      const timers = sandbox.useFakeTimers();
      await SupportQueue.addUnqueuedUser('nick');
      timers.tick(301000);
      assert.calledOnceWithExactly(
        messageStub,
        'chan',
        'Hi nick, we do not allow idling in support channels. Please queue with !queue <reason> or part the channel.'
      );
    });

    it('kicks user after 5+15 minutes', async () => {
      const timers = sandbox.useFakeTimers();
      await SupportQueue.addUnqueuedUser('nick');
      timers.tick(301000);
      timers.tick(901000);
      assert.calledOnceWithExactly(kickUserStub, 'chan', 'nick');
    });
  });

  describe('renameUser', () => {
    let mockDBPut: SinonStub;
    beforeEach(() => {
      mockDBPut = sandbox.stub(LevelDB, 'put');
      sandbox.replace(SupportQueue, 'queue', []);
      sandbox.replace(SupportQueue, 'unqueuedUsers', {});
    });

    it('updates old nick of queued user to new nick and saves to state', async () => {
      SupportQueue.queue = [{ nick: 'oldNick' } as any];
      await SupportQueue.renameUser('oldNick', 'newNick');
      assert.calledOnceWithExactly(mockDBPut, 'queue::queuedUsers', [{ nick: 'newNick' }]);
      expect(SupportQueue.queue).to.deep.equal([{ nick: 'newNick' }]);
    });

    it('updates old nick of unqueued user to new nick', async () => {
      SupportQueue.unqueuedUsers['oldnick'] = 'test' as any;
      await SupportQueue.renameUser('oldNick', 'newNick');
      expect(SupportQueue.unqueuedUsers['newnick']).to.equal('test');
    });
  });

  describe('queueUser', () => {
    let mockDBPut: SinonStub;
    let mockIsInQueue: SinonStub;
    let mockWhoIs: SinonStub;
    let mockMessage: SinonStub;
    beforeEach(() => {
      mockDBPut = sandbox.stub(LevelDB, 'put');
      mockIsInQueue = sandbox.stub(SupportQueue, 'isInQueue').returns(false);
      mockWhoIs = sandbox.stub(IRCClient, 'whois').resolves({ actual_ip: 'ip' } as any);
      mockMessage = sandbox.stub(IRCClient, 'message');
      sandbox.replace(SupportQueue, 'queue', []);
      sandbox.replace(SupportQueue, 'unqueuedUsers', {});
    });

    it('removes user from unqueued users', async () => {
      SupportQueue.unqueuedUsers = { nick: setTimeout(() => '', 100) };
      await SupportQueue.queueUser('nick', 'reason');
      expect(SupportQueue.unqueuedUsers).to.deep.equal({});
    });

    it('returns false if user was already in queue', async () => {
      mockIsInQueue.returns(true);
      expect(await SupportQueue.queueUser('nick', 'reason')).to.be.false;
    });

    it('pushes user to queue with correct params and saves to state', async () => {
      const fakeDate = new Date();
      sandbox.useFakeTimers(fakeDate);
      await SupportQueue.queueUser('nick', 'reason');
      assert.calledOnceWithExactly(mockWhoIs, 'nick');
      expect(SupportQueue.queue).to.deep.equal([{ nick: 'nick', reason: 'reason', time: fakeDate, ip: 'ip' }]);
      assert.calledOnceWithExactly(mockDBPut, 'queue::queuedUsers', SupportQueue.queue);
    });

    it('sends announcement message to staff support channel', async () => {
      await SupportQueue.queueUser('nick', 'reason');
      assert.calledOnceWithExactly(mockMessage, IRCClient.staffSupportChan, 'User nick requires support: reason');
    });

    it('returns true if newly queued user', async () => {
      expect(await SupportQueue.queueUser('nick', 'reason')).to.be.true;
    });
  });

  describe('unqueueUser', () => {
    let mockDBPut: SinonStub;
    beforeEach(() => {
      mockDBPut = sandbox.stub(LevelDB, 'put');
      sandbox.replace(SupportQueue, 'queue', []);
    });

    it('throws an error if providing both index and nick', async () => {
      try {
        await SupportQueue.unqueueUser(1, 'nick');
      } catch (e) {
        return;
      }
      expect.fail('did not throw');
    });

    it('throws an error if fetching a position larger than the queue', async () => {
      try {
        await SupportQueue.unqueueUser(99);
      } catch (e) {
        return;
      }
      expect.fail('did not throw');
    });

    it('throws an error if fetching a nick not in the queue', async () => {
      try {
        await SupportQueue.unqueueUser(undefined, 'badnick');
      } catch (e) {
        return;
      }
      expect.fail('did not throw');
    });

    it('extracts/returns first user in the queue by default', async () => {
      SupportQueue.queue = ['one', 'two', 'three'] as any;
      expect(await SupportQueue.unqueueUser()).to.equal('one');
      expect(SupportQueue.queue).to.deep.equal(['two', 'three']);
    });

    it('extracts/returns correct zero-based queued user when supplying index', async () => {
      SupportQueue.queue = ['one', 'two', 'three'] as any;
      expect(await SupportQueue.unqueueUser(1)).to.equal('two');
      expect(SupportQueue.queue).to.deep.equal(['one', 'three']);
    });

    it('extracts/returns correct user when supplying nick', async () => {
      SupportQueue.queue = [{ nick: 'one' }, { nick: 'two' }, { nick: 'three' }] as any;
      expect(await SupportQueue.unqueueUser(undefined, 'two')).to.deep.equal({ nick: 'two' });
      expect(SupportQueue.queue).to.deep.equal([{ nick: 'one' }, { nick: 'three' }]);
    });

    it('saves updated queue to state after removing unqueued user', async () => {
      SupportQueue.queue = ['one', 'two', 'three'] as any;
      await SupportQueue.unqueueUser();
      assert.calledOnceWithExactly(mockDBPut, 'queue::queuedUsers', ['two', 'three']);
    });
  });
});
