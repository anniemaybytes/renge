import { expect } from 'chai';
import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { IRCClient } from '../clients/irc';
import { LevelDB } from '../clients/leveldb';
import * as utils from '../utils';
import { QueueManager } from './queueManager';

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
    it('Returns false if nick is not in queue', () => {
      sandbox.replace(QueueManager, 'queue', []);
      expect(QueueManager.isInQueue('nick')).to.be.false;
    });

    it('Returns true if nick is in queue', () => {
      sandbox.replace(QueueManager, 'queue', [{ nick: 'Nick' } as any]);
      expect(QueueManager.isInQueue('nick')).to.be.true;
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
      sandbox.replace(QueueManager, 'queue', []);
      mockDBGet = sandbox.stub(LevelDB, 'get').resolves([{ nick: 'nick', reason: 'reason', time: '2000-01-01T00:00:00.000Z', ip: 'ip' }]);
      mockAddRename = sandbox.stub(IRCClient, 'addUserRenameHandler');
      mockAddJoin = sandbox.stub(IRCClient, 'addUserJoinHandler');
      mockAddLeave = sandbox.stub(IRCClient, 'addUserLeaveHandler');
      mockAddDisconnect = sandbox.stub(IRCClient, 'addDisconnectHandler');
      mockAddConnect = sandbox.stub(IRCClient, 'addConnectHandler');
    });

    it('Loads queue from db state', async () => {
      await QueueManager.initQueue();
      assert.calledOnceWithExactly(mockDBGet, 'queue::queuedUsers');
      expect(QueueManager.queue).to.deep.equal([{ nick: 'nick', reason: 'reason', time: new Date('2000-01-01T00:00:00.000Z'), ip: 'ip' }]);
    });

    it('Sets queue to empty if db get throws not found', async () => {
      mockDBGet.throws({ type: 'NotFoundError' });
      await QueueManager.initQueue();
      expect(QueueManager.queue).to.deep.equal([]);
    });

    it('Throws if there was an error loading from the db', async () => {
      mockDBGet.throws('err');
      try {
        await QueueManager.initQueue();
      } catch (e) {
        return;
      }
      expect.fail('Did not throw');
    });

    it('Adds IRC user rename handler', async () => {
      await QueueManager.initQueue();
      assert.calledOnceWithExactly(mockAddRename, QueueManager.renameUser);
    });

    it('Adds IRC user join handler', async () => {
      await QueueManager.initQueue();
      assert.calledOnceWithExactly(mockAddJoin, QueueManager.userJoinHandler);
    });

    it('Adds IRC user leave handler which does nothing if not support channel', async () => {
      const unqueueUserStub = sandbox.stub(QueueManager, 'unqueueUser');
      await QueueManager.initQueue();
      assert.calledOnce(mockAddLeave);
      await mockAddLeave.getCall(0).args[0]('nick', 'randomchan');
      assert.notCalled(unqueueUserStub);
    });

    it('Adds IRC user leave handler which removes queued/unqueued user', async () => {
      const unqueueUserStub = sandbox.stub(QueueManager, 'unqueueUser');
      sandbox.replace(QueueManager, 'unqueuedUsers', { nick: setTimeout(() => '', 0) });
      await QueueManager.initQueue();
      assert.calledOnce(mockAddLeave);
      await mockAddLeave.getCall(0).args[0]('nick', 'chan');
      assert.calledOnce(unqueueUserStub);
      expect(QueueManager.unqueuedUsers).to.deep.equal({});
    });

    it('Adds IRC disconnect handler which removes all unqueued users', async () => {
      sandbox.replace(QueueManager, 'unqueuedUsers', { nick: setTimeout(() => '', 0) });
      await QueueManager.initQueue();
      assert.calledOnce(mockAddDisconnect);
      mockAddDisconnect.getCall(0).args[0]();
      expect(QueueManager.unqueuedUsers).to.deep.equal({});
    });

    it('Adds IRC connect handler', async () => {
      await QueueManager.initQueue();
      assert.calledOnceWithExactly(mockAddConnect, QueueManager.nowConnected);
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
      mockInQueue = sandbox.stub(QueueManager, 'isInQueue').returns(false);
      mockAddUnqueuedUser = sandbox.stub(QueueManager, 'addUnqueuedUser');
    });

    it('Keeps users in queue who are still in the support channel', async () => {
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['nick']) });
      sandbox.replace(QueueManager, 'queue', [{ nick: 'nick' }, { nick: 'left' } as any]);
      await QueueManager.nowConnected();
      expect(QueueManager.queue).to.deep.equal([{ nick: 'nick' }]);
    });

    it('Saves queue to state', async () => {
      await QueueManager.nowConnected();
      assert.calledOnceWithExactly(mockDBPut, 'queue::queuedUsers', []);
    });

    it('Adds users who are in support channel but not in the queue as unqueued', async () => {
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['nick']) });
      await QueueManager.nowConnected();
      assert.calledOnce(mockIsMe);
      assert.calledOnceWithExactly(mockInQueue, 'nick');
      assert.calledOnceWithExactly(mockAddUnqueuedUser, 'nick');
    });

    it('Does not add self to unqueued users', async () => {
      mockIsMe.returns(true);
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['me']) });
      await QueueManager.nowConnected();
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
      addUnqueuedUserStub = sandbox.stub(QueueManager, 'addUnqueuedUser');
      sandbox.stub(utils, 'sleep');
    });

    it('Does nothing if not support channel', async () => {
      await QueueManager.userJoinHandler('nick', 'randomchan');
      assert.notCalled(isStaffStub);
      assert.notCalled(messageStub);
      assert.notCalled(addUnqueuedUserStub);
    });

    it('Does nothing if staff', async () => {
      isStaffStub.resolves(true);
      await QueueManager.userJoinHandler('nick', 'chan');
      assert.notCalled(messageStub);
      assert.notCalled(addUnqueuedUserStub);
    });

    it('Sends welcome message to IRC user support channel', async () => {
      await QueueManager.userJoinHandler('nick', 'chan');
      assert.calledOnceWithExactly(
        messageStub,
        'chan',
        'Hi nick! If you need your account re-enabled please type !reenable <your username>. Otherwise please enter the support queue with !queue <reason you need assistance>.'
      );
    });

    it('Adds new joined user as unqueued', async () => {
      await QueueManager.userJoinHandler('nick', 'chan');
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
      sandbox.replace(QueueManager, 'unqueuedUsers', {});
    });

    it('Does nothing if nick not in support channel', async () => {
      IRCClient.channelState['chan'] = new Set();
      await QueueManager.addUnqueuedUser('nick');
      expect(QueueManager.unqueuedUsers).to.deep.equal({});
    });

    it('Does nothing if staff', async () => {
      isStaffStub.resolves(true);
      await QueueManager.addUnqueuedUser('nick');
      expect(QueueManager.unqueuedUsers).to.deep.equal({});
    });

    it('Does nothing if channel op', async () => {
      isChannelOp.resolves(true);
      await QueueManager.addUnqueuedUser('nick');
      expect(QueueManager.unqueuedUsers).to.deep.equal({});
    });

    it('Adds an unqueued user timeout', async () => {
      await QueueManager.addUnqueuedUser('nick');
      expect(QueueManager.unqueuedUsers['nick']).to.not.be.undefined;
    });

    it('Send warning message to user after 5 minutes', async () => {
      const timers = sandbox.useFakeTimers();
      await QueueManager.addUnqueuedUser('nick');
      timers.tick(301000);
      assert.calledOnceWithExactly(
        messageStub,
        'chan',
        'Hi nick, we do not allow idling in support channels. Please queue with !queue <reason> or part the channel.'
      );
    });

    it('Kicks user after 5+15 minutes', async () => {
      const timers = sandbox.useFakeTimers();
      await QueueManager.addUnqueuedUser('nick');
      timers.tick(301000);
      timers.tick(901000);
      assert.calledOnceWithExactly(kickUserStub, 'chan', 'nick');
    });
  });

  describe('renameUser', () => {
    let mockDBPut: SinonStub;
    beforeEach(() => {
      mockDBPut = sandbox.stub(LevelDB, 'put');
      sandbox.replace(QueueManager, 'queue', []);
      sandbox.replace(QueueManager, 'unqueuedUsers', {});
    });

    it('Updates old nick of queued user to new nick and saves to state', async () => {
      QueueManager.queue = [{ nick: 'oldNick' } as any];
      await QueueManager.renameUser('oldNick', 'newNick');
      assert.calledOnceWithExactly(mockDBPut, 'queue::queuedUsers', [{ nick: 'newNick' }]);
      expect(QueueManager.queue).to.deep.equal([{ nick: 'newNick' }]);
    });

    it('Updates old nick of unqueued user to new nick', async () => {
      QueueManager.unqueuedUsers['oldnick'] = 'test' as any;
      await QueueManager.renameUser('oldNick', 'newNick');
      expect(QueueManager.unqueuedUsers['newnick']).to.equal('test');
    });
  });

  describe('queueUser', () => {
    let mockDBPut: SinonStub;
    let mockIsInQueue: SinonStub;
    let mockWhoIs: SinonStub;
    let mockMessage: SinonStub;
    beforeEach(() => {
      mockDBPut = sandbox.stub(LevelDB, 'put');
      mockIsInQueue = sandbox.stub(QueueManager, 'isInQueue').returns(false);
      mockWhoIs = sandbox.stub(IRCClient, 'whois').resolves({ actual_ip: 'ip' } as any);
      mockMessage = sandbox.stub(IRCClient, 'message');
      sandbox.replace(QueueManager, 'queue', []);
      sandbox.replace(QueueManager, 'unqueuedUsers', {});
    });

    it('Removes user from unqueued users', async () => {
      QueueManager.unqueuedUsers = { nick: setTimeout(() => '', 100) };
      await QueueManager.queueUser('nick', 'reason');
      expect(QueueManager.unqueuedUsers).to.deep.equal({});
    });

    it('Returns false if user was already in queue', async () => {
      mockIsInQueue.returns(true);
      expect(await QueueManager.queueUser('nick', 'reason')).to.be.false;
    });

    it('Pushes user to queue with correct params and saves to state', async () => {
      const fakeDate = new Date();
      sandbox.useFakeTimers(fakeDate);
      await QueueManager.queueUser('nick', 'reason');
      assert.calledOnceWithExactly(mockWhoIs, 'nick');
      expect(QueueManager.queue).to.deep.equal([{ nick: 'nick', reason: 'reason', time: fakeDate, ip: 'ip' }]);
      assert.calledOnceWithExactly(mockDBPut, 'queue::queuedUsers', QueueManager.queue);
    });

    it('Sends announcement message to staff support channel', async () => {
      await QueueManager.queueUser('nick', 'reason');
      assert.calledOnceWithExactly(mockMessage, IRCClient.staffSupportChan, 'User nick requires support: reason');
    });

    it('Returns true if newly queued user', async () => {
      expect(await QueueManager.queueUser('nick', 'reason')).to.be.true;
    });
  });

  describe('unqueueUser', () => {
    let mockDBPut: SinonStub;
    beforeEach(() => {
      mockDBPut = sandbox.stub(LevelDB, 'put');
      sandbox.replace(QueueManager, 'queue', []);
    });

    it('Throws an error if providing both index and nick', async () => {
      try {
        await QueueManager.unqueueUser(1, 'nick');
      } catch (e) {
        return;
      }
      expect.fail('Did not throw');
    });

    it('Throws an error if fetching a position larger than the queue', async () => {
      try {
        await QueueManager.unqueueUser(99);
      } catch (e) {
        return;
      }
      expect.fail('Did not throw');
    });

    it('Throws an error if fetching a nick not in the queue', async () => {
      try {
        await QueueManager.unqueueUser(undefined, 'badnick');
      } catch (e) {
        return;
      }
      expect.fail('Did not throw');
    });

    it('Extracts/returns first user in the queue by default', async () => {
      QueueManager.queue = ['one', 'two', 'three'] as any;
      expect(await QueueManager.unqueueUser()).to.equal('one');
      expect(QueueManager.queue).to.deep.equal(['two', 'three']);
    });

    it('Extracts/returns correct zero-based queued user when supplying index', async () => {
      QueueManager.queue = ['one', 'two', 'three'] as any;
      expect(await QueueManager.unqueueUser(1)).to.equal('two');
      expect(QueueManager.queue).to.deep.equal(['one', 'three']);
    });

    it('Extracts/returns correct user when supplying nick', async () => {
      QueueManager.queue = [{ nick: 'one' }, { nick: 'two' }, { nick: 'three' }] as any;
      expect(await QueueManager.unqueueUser(undefined, 'two')).to.deep.equal({ nick: 'two' });
      expect(QueueManager.queue).to.deep.equal([{ nick: 'one' }, { nick: 'three' }]);
    });

    it('Saves updated queue to state after removing unqueued user', async () => {
      QueueManager.queue = ['one', 'two', 'three'] as any;
      await QueueManager.unqueueUser();
      assert.calledOnceWithExactly(mockDBPut, 'queue::queuedUsers', ['two', 'three']);
    });
  });
});
