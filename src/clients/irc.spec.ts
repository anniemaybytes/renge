import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { expect } from 'chai';

import { IRCClient } from './irc.js';

describe('IRCClient', () => {
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('isMe', () => {
    it('Returns true if user is the bot', () => {
      sandbox.replace(IRCClient, 'IRC_NICK', 'me');
      expect(IRCClient.isMe('Me')).to.be.true;
    });

    it('Returns false if user is not the bot', () => {
      sandbox.replace(IRCClient, 'IRC_NICK', 'me');
      expect(IRCClient.isMe('notMe')).to.be.false;
    });
  });

  describe('checkIfRegistered', () => {
    it('Should do nothing if registered', () => {
      sandbox.replace(IRCClient, 'registered', true);
      IRCClient.checkIfRegistered();
    });

    it('Should throw error if not registered', () => {
      sandbox.replace(IRCClient, 'registered', false);
      try {
        IRCClient.checkIfRegistered();
      } catch (e) {
        return;
      }
      expect.fail('Did not throw');
    });
  });

  describe('mainChannels', () => {
    it('Returns an array with channels for support log, staff support, queue announce, and user support', () => {
      sandbox.replace(IRCClient, 'staffSupportChan', '#1');
      sandbox.replace(IRCClient, 'userSupportChan', '#2');
      sandbox.replace(IRCClient, 'supportLogChan', '#3');
      const response = IRCClient.mainChannels();
      expect(response).to.include('#1');
      expect(response).to.include('#2');
      expect(response).to.include('#3');
    });
  });

  describe('connect', () => {
    let frameworkConnectStub: SinonStub;
    beforeEach(() => {
      frameworkConnectStub = sandbox.stub(IRCClient.bot, 'connect');
    });
    it('Attempts to connect to IRC with specified parameters', () => {
      IRCClient.connect();
      assert.calledWith(frameworkConnectStub, {
        host: IRCClient.IRC_SERVER,
        port: IRCClient.IRC_PORT,
        nick: IRCClient.IRC_NICK,
        username: IRCClient.IRC_USERNAME,
        gecos: IRCClient.IRC_REALNAME,
        ssl: IRCClient.IRC_USE_SSL,
        rejectUnauthorized: IRCClient.IRC_VERIFY_SSL,
      });
    });
  });

  describe('shutDown', () => {
    let frameworkQuitStub: SinonStub;
    beforeEach(() => {
      frameworkQuitStub = sandbox.stub(IRCClient.bot, 'quit');
    });
    it('Attempts to connect to IRC with specified parameters', () => {
      IRCClient.shutDown();
      assert.calledOnce(frameworkQuitStub);
    });
  });

  describe('postOper', () => {
    let mainChannelsStub: SinonStub;
    let rawCommandStub: SinonStub;
    let joinChannel: SinonStub;
    let setupChanStub: SinonStub;
    beforeEach(() => {
      sandbox.replace(IRCClient, 'supportSessionChannels', []);
      sandbox.replace(IRCClient, 'channelState', {});
      mainChannelsStub = sandbox.stub(IRCClient, 'mainChannels').returns([]);
      rawCommandStub = sandbox.stub(IRCClient, 'rawCommand');
      joinChannel = sandbox.stub(IRCClient, 'joinChannel');
      setupChanStub = sandbox.stub(IRCClient, 'setUpSessionChannel');
    });

    it('Sets registered to true on IRCClient', async () => {
      sandbox.replace(IRCClient, 'registered', false);
      await IRCClient.postOper();
      expect(IRCClient.registered).to.be.true;
    });

    it('Sets joined to true on IRCClient', async () => {
      sandbox.replace(IRCClient, 'registered', false);
      await IRCClient.postOper();
      expect(IRCClient.joined).to.be.true;
    });

    it('Performs MODE and CHGHOST', async () => {
      await IRCClient.postOper();
      assert.calledWithExactly(rawCommandStub.getCall(0), 'MODE', IRCClient.IRC_NICK, '+B');
      assert.calledWithExactly(rawCommandStub.getCall(1), 'CHGHOST', IRCClient.IRC_NICK, 'bakus.dungeon');
    });

    it('Calls joinChannel for main channels', async () => {
      mainChannelsStub.returns(['channel']);
      await IRCClient.postOper();
      assert.calledWithExactly(joinChannel, 'channel');
    });

    it('Calls joinChannel and setUpSessionChannel for support session channels', async () => {
      IRCClient.supportSessionChannels = ['supportsession'];
      IRCClient.channelState = { supportsession: new Set<string>() };
      await IRCClient.postOper();
      assert.calledWithExactly(joinChannel, 'supportsession');
      assert.calledWithExactly(setupChanStub, 'supportsession');
    });
  });

  describe('setUpSessionChannel', () => {
    let rawCommandStub: SinonStub;
    beforeEach(() => {
      rawCommandStub = sandbox.stub(IRCClient, 'rawCommand');
    });

    it('Sets correct modes on provided channel', () => {
      IRCClient.setUpSessionChannel('supportsession');
      assert.calledWithExactly(rawCommandStub.getCall(0), 'SAMODE', 'supportsession', '+o', IRCClient.IRC_NICK);
      assert.calledWithExactly(rawCommandStub.getCall(1), 'MODE', 'supportsession', '+ins');
      assert.calledWithExactly(rawCommandStub.getCall(2), 'MODE', 'supportsession', '+I', IRCClient.staffHostMasks[0]);
    });
  });

  describe('joinChannel', () => {
    let rawCommandStub: SinonStub;
    beforeEach(() => {
      rawCommandStub = sandbox.stub(IRCClient, 'rawCommand');
    });

    it('Returns a promise', () => {
      expect(IRCClient.joinChannel('channel')).to.be.instanceOf(Promise);
    });

    it('Calls SAJOIN with correct parameters', () => {
      IRCClient.joinChannel('channel');
      assert.calledOnceWithExactly(rawCommandStub, 'SAJOIN', IRCClient.IRC_NICK, 'channel');
    });
  });

  describe('joinUserToChannel', () => {
    let rawCommandStub: SinonStub;
    beforeEach(() => {
      rawCommandStub = sandbox.stub(IRCClient, 'rawCommand');
    });

    it('Returns a promise', () => {
      expect(IRCClient.joinUserToChannel('channel', 'nick')).to.be.instanceOf(Promise);
    });

    it('Calls SAJOIN with correct parameters', () => {
      sandbox.replace(IRCClient, 'channelState', { channel: new Set([]) });
      IRCClient.joinUserToChannel('channel', 'nick');
      assert.calledOnceWithExactly(rawCommandStub, 'SAJOIN', 'nick', 'channel');
    });
  });

  describe('isChannelOp', () => {
    let whoStub: SinonStub;
    beforeEach(() => {
      whoStub = sandbox.stub(IRCClient, 'who').resolves([]);
    });

    it('Returns false if nick is not in channel', async () => {
      expect(await IRCClient.isChannelOp('chan', 'nick')).to.be.false;
    });

    it('Returns false if matching nick in channel has mode o', async () => {
      whoStub.resolves([{ nick: 'nick', channel_modes: ['a'] }]);
      expect(await IRCClient.isChannelOp('chan', 'nick')).to.be.false;
    });

    it('Returns true if matching nick in channel has mode o', async () => {
      whoStub.resolves([{ nick: 'nick', channel_modes: ['o'] }]);
      expect(await IRCClient.isChannelOp('chan', 'nick')).to.be.true;
    });
  });

  describe('isStaff', () => {
    let whoisStub: SinonStub;
    beforeEach(() => {
      whoisStub = sandbox.stub(IRCClient, 'whois');
    });

    it('Returns true if whois matches staff host mask', async () => {
      whoisStub.resolves({ nick: 'nick', ident: 'ident', hostname: 'host' });
      sandbox.replace(IRCClient, 'staffHostMasks', ['*!*@*']);
      expect(await IRCClient.isStaff('nick')).to.be.true;
    });

    it('Returns false if whois does not match staff host mask', async () => {
      whoisStub.resolves({ nick: 'nick', ident: 'ident', hostname: 'host' });
      sandbox.replace(IRCClient, 'staffHostMasks', ['*!*@notyou']);
      expect(await IRCClient.isStaff('nick')).to.be.false;
    });
  });

  describe('kickUserFromChannel', () => {
    let rawCommandStub: SinonStub;
    beforeEach(() => {
      rawCommandStub = sandbox.stub(IRCClient, 'rawCommand');
    });

    it('Calls SAPART with correct parameters', () => {
      IRCClient.kickUserFromChannel('chan', 'nick');
      assert.calledOnceWithExactly(rawCommandStub, 'SAPART', 'nick', 'chan');
    });
  });

  describe('waitUntilJoined', () => {
    it('Returns if client is joined', async () => {
      sandbox.replace(IRCClient, 'joined', true);
      await IRCClient.waitUntilJoined();
    });
  });

  describe('rawCommand', () => {
    let checkIfRegisteredStub: SinonStub;
    let rawStub: SinonStub;
    beforeEach(() => {
      checkIfRegisteredStub = sandbox.stub(IRCClient, 'checkIfRegistered');
      rawStub = sandbox.stub(IRCClient.bot, 'raw');
    });

    it('Checks if connected when performing command', () => {
      IRCClient.rawCommand('stuff');
      assert.calledOnce(checkIfRegisteredStub);
    });

    it('Generates a string which is passed to the framework raw interface', () => {
      IRCClient.rawCommand('this', 'is', 'a', 'raw', 'command');
      assert.calledWithExactly(rawStub, 'this is a raw command');
    });
  });

  describe('who', () => {
    let checkIfRegisteredStub: SinonStub;
    let whoStub: SinonStub;
    beforeEach(() => {
      checkIfRegisteredStub = sandbox.stub(IRCClient, 'checkIfRegistered');
      whoStub = sandbox.stub(IRCClient as any, 'bot_who').resolves({ users: ['blah'] });
    });

    it('Checks if connected when performing command', async () => {
      await IRCClient.who('chan');
      assert.calledOnce(checkIfRegisteredStub);
    });

    it('Passes and returns the correct arguments to the irc-framework', async () => {
      expect(await IRCClient.who('chan')).to.deep.equal(['blah']);
      assert.calledWithExactly(whoStub, 'chan');
    });
  });

  describe('whois', () => {
    let checkIfRegisteredStub: SinonStub;
    let whoisStub: SinonStub;
    beforeEach(() => {
      checkIfRegisteredStub = sandbox.stub(IRCClient, 'checkIfRegistered');
      whoisStub = sandbox.stub(IRCClient as any, 'bot_whois').resolves({ some: 'data' });
    });

    it('Checks if connected when performing command', async () => {
      await IRCClient.whois('chan');
      assert.calledOnce(checkIfRegisteredStub);
    });

    it('Passes and returns the correct arguments to the irc-framework', async () => {
      expect(await IRCClient.whois('chan')).to.deep.equal({ some: 'data' });
      assert.calledWithExactly(whoisStub, 'chan');
    });
  });

  describe('message', () => {
    let checkIfRegisteredStub: SinonStub;
    let sayStub: SinonStub;
    beforeEach(() => {
      checkIfRegisteredStub = sandbox.stub(IRCClient, 'checkIfRegistered');
      sayStub = sandbox.stub(IRCClient.bot, 'say');
    });

    it('Checks if connected when performing command', () => {
      IRCClient.message('chan', 'message');
      assert.calledOnce(checkIfRegisteredStub);
    });

    it('Passes the correct arguments to the irc-framework', () => {
      IRCClient.message('chan', 'message');
      assert.calledWithExactly(sayStub, 'chan', 'message');
    });

    it('Sends multiple messages when there are newlines in the message', () => {
      IRCClient.message('chan', 'message\nanother');
      assert.calledWithExactly(sayStub.getCall(0), 'chan', 'message');
      assert.calledWithExactly(sayStub.getCall(1), 'chan', 'another');
    });
  });

  describe('notice', () => {
    let checkIfRegisteredStub: SinonStub;
    let noticeStub: SinonStub;
    beforeEach(() => {
      checkIfRegisteredStub = sandbox.stub(IRCClient, 'checkIfRegistered');
      noticeStub = sandbox.stub(IRCClient.bot, 'notice');
    });

    it('Checks if connected when performing command', () => {
      IRCClient.notice('nick', 'message');
      assert.calledOnce(checkIfRegisteredStub);
    });

    it('Passes the correct arguments to the irc-framework', () => {
      IRCClient.notice('nick', 'message');
      assert.calledWithExactly(noticeStub, 'nick', 'message');
    });

    it('Sends multiple notices when there are newlines in the message', () => {
      IRCClient.notice('nick', 'message\nanother');
      assert.calledWithExactly(noticeStub.getCall(0), 'nick', 'message');
      assert.calledWithExactly(noticeStub.getCall(1), 'nick', 'another');
    });
  });

  describe('handleUserJoin', () => {
    beforeEach(() => {
      sandbox.stub(IRCClient, 'isMe').returns(false);
    });

    it('Adds joining nick to channel state if not me', async () => {
      sandbox.replace(IRCClient, 'channelState', { chan: new Set([]) });
      sandbox.replace(IRCClient, 'joinHandlers', new Set());
      await IRCClient.handleUserJoin('chan', 'nick');
      expect(IRCClient.channelState['chan'].has('nick')).to.be.true;
    });

    it('Calls joinHandlers callbacks if not me', async () => {
      const myCallback = sandbox.stub();
      sandbox.replace(IRCClient, 'channelState', { chan: new Set([]) });
      sandbox.replace(IRCClient, 'joinHandlers', new Set([myCallback]));
      await IRCClient.handleUserJoin('chan', 'nick');
      assert.calledOnceWithExactly(myCallback, 'nick', 'chan');
    });
  });

  describe('handleChannelLeave', () => {
    let mainChannelsStub: SinonStub;
    let joinChannelStub: SinonStub;
    beforeEach(() => {
      mainChannelsStub = sandbox.stub(IRCClient, 'mainChannels').returns([]);
      joinChannelStub = sandbox.stub(IRCClient, 'joinChannel');
    });

    it('Deletes channel state if is me', async () => {
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['stuff']) });
      await IRCClient.handleChannelLeave('chan', IRCClient.IRC_NICK, 'parted');
      expect(IRCClient.channelState['chan']).to.be.undefined;
    });

    it('Attempts to rejoin channel if is me and is a main channel', async () => {
      mainChannelsStub.returns(['chan']);
      await IRCClient.handleChannelLeave('chan', IRCClient.IRC_NICK, 'parted');
      assert.calledWithExactly(joinChannelStub, 'chan');
    });

    it('Attempts to rejoin channel if is me and is a support session channel', async () => {
      mainChannelsStub.returns(['chan']);
      await IRCClient.handleChannelLeave('chan', IRCClient.IRC_NICK, 'parted');
      assert.calledWithExactly(joinChannelStub, 'chan');
    });

    it('Does not normally attempt to rejoin channel if is me', async () => {
      sandbox.replace(IRCClient, 'supportSessionChannels', []);
      await IRCClient.handleChannelLeave('chan', IRCClient.IRC_NICK, 'parted');
      assert.notCalled(joinChannelStub);
    });

    it('Removes leaving nick from channel state if not me', async () => {
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['nick']) });
      sandbox.replace(IRCClient, 'leaveHandlers', new Set());
      await IRCClient.handleChannelLeave('chan', 'nick', 'parted');
      expect(IRCClient.channelState['chan'].has('nick')).to.be.false;
    });

    it('Calls leaveHandler callbacks if not me', async () => {
      const myCallback = sandbox.stub();
      sandbox.replace(IRCClient, 'channelState', { chan: new Set([]) });
      sandbox.replace(IRCClient, 'leaveHandlers', new Set([myCallback]));
      await IRCClient.handleChannelLeave('chan', 'nick', 'parted');
      assert.calledOnceWithExactly(myCallback, 'nick', 'chan', 'parted');
    });
  });

  describe('handleUserLeave', () => {
    it('Removes nick from channel state', async () => {
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['nick']) });
      sandbox.replace(IRCClient, 'leaveHandlers', new Set());
      await IRCClient.handleUserLeave('nick');
      expect(IRCClient.channelState['chan'].has('nick')).to.be.false;
    });

    it('Calls leaveHandlers callbacks if not me', async () => {
      const myCallback = sandbox.stub();
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['nick']) });
      sandbox.replace(IRCClient, 'leaveHandlers', new Set([myCallback]));
      await IRCClient.handleUserLeave('nick');
      assert.calledOnceWithExactly(myCallback, 'nick', 'chan', 'quit');
    });
  });

  describe('handleUserList', () => {
    it('Set channel state with new nicks', async () => {
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['oldnick']) });
      await IRCClient.handleUserList('chan', [{ nick: 'newnick1' }, { nick: 'newnick2' }]);
      expect(IRCClient.channelState['chan'].has('oldnick')).to.be.false;
      expect(IRCClient.channelState['chan'].has('newnick1')).to.be.true;
      expect(IRCClient.channelState['chan'].has('newnick2')).to.be.true;
    });
  });

  describe('handleUserNewNick', () => {
    it('Updates nicks in channel state', async () => {
      sandbox.replace(IRCClient, 'channelState', { chan: new Set(['oldnick']) });
      sandbox.replace(IRCClient, 'renameHandlers', new Set());
      await IRCClient.handleUserNewNick('oldnick', 'newnick');
      expect(IRCClient.channelState['chan'].has('oldnick')).to.be.false;
      expect(IRCClient.channelState['chan'].has('newnick')).to.be.true;
    });

    it('Calls renameHandlers callbacks', async () => {
      const myCallback = sandbox.stub();
      sandbox.replace(IRCClient, 'channelState', {});
      sandbox.replace(IRCClient, 'renameHandlers', new Set([myCallback]));
      await IRCClient.handleUserNewNick('oldNick', 'newNick');
      assert.calledOnceWithExactly(myCallback, 'oldNick', 'newNick');
    });
  });

  describe('handleDisconnect', () => {
    beforeEach(() => {
      sandbox.replace(IRCClient, 'channelState', { '#chan': new Set(['someone']) });
      sandbox.replace(IRCClient, 'registered', true);
      sandbox.replace(IRCClient, 'disconnectHandlers', new Set());
    });

    it('Clears channel state', () => {
      IRCClient.handleDisconnect();
      expect(IRCClient.channelState).to.deep.equal({});
    });

    it('Sets registered to false', () => {
      IRCClient.handleDisconnect();
      expect(IRCClient.registered).to.be.false;
    });

    it('Calls custom registered disconnect handlers', () => {
      const customDisconnectHandler = sandbox.stub();
      IRCClient.addDisconnectHandler(customDisconnectHandler);
      IRCClient.handleDisconnect();
      assert.calledOnce(customDisconnectHandler);
    });
  });

  describe('callbackWrapper', () => {
    it('Generates a function which calls callback if matching target', () => {
      const userCallback = sandbox.stub();
      const generatedCallback = IRCClient.callbackWrapper('#Channel', userCallback);
      generatedCallback({ target: '#channel' } as any);
      assert.calledWithExactly(userCallback, { target: '#channel' });
    });
  });

  describe('addMessageHookInChannel', () => {
    let matchMessageStub: SinonStub;
    let callbackWrapperStub: SinonStub;
    beforeEach(() => {
      matchMessageStub = sandbox.stub(IRCClient.bot, 'matchMessage').returns({});
      callbackWrapperStub = sandbox.stub(IRCClient, 'callbackWrapper').returns('ok' as any);
    });

    it('Adds the messagehook to IRCClient with the correct parameters', () => {
      const myRegex = /.*/;
      const myCallback = () => 'whatever';
      IRCClient.addMessageHookInChannel('#channel', myRegex, myCallback);
      assert.calledWithExactly(callbackWrapperStub, '#channel', myCallback);
      assert.calledWithExactly(matchMessageStub, myRegex, 'ok');
    });

    it('Returns the function from IRCClient to remove the added listener', () => {
      const removeListenerFunc = () => 'blah';
      matchMessageStub.returns({ stop: removeListenerFunc });
      expect(IRCClient.addMessageHookInChannel('#channel', /.*/, () => 'whatever') === removeListenerFunc).to.be.true;
    });
  });

  describe('addUserLeaveHandler', () => {
    beforeEach(() => {
      sandbox.replace(IRCClient, 'leaveHandlers', new Set());
    });

    it('Adds the provided callback to the IRCClient leaveHandlers', () => {
      const myCallback = () => 'whatever';
      IRCClient.addUserLeaveHandler(myCallback);
      expect(IRCClient.leaveHandlers.has(myCallback)).to.be.true;
    });

    it('Returns a function which removes the callback when called', () => {
      const myCallback = () => 'whatever';
      IRCClient.addUserLeaveHandler(myCallback)();
      expect(IRCClient.leaveHandlers.has(myCallback)).to.be.false;
    });
  });

  describe('addUserJoinHandler', () => {
    beforeEach(() => {
      sandbox.replace(IRCClient, 'joinHandlers', new Set());
    });

    it('Adds the provided callback to the IRCClient joinHandlers', () => {
      const myCallback = () => 'whatever';
      IRCClient.addUserJoinHandler(myCallback);
      expect(IRCClient.joinHandlers.has(myCallback)).to.be.true;
    });

    it('Returns a function which removes the callback when called', () => {
      const myCallback = () => 'whatever';
      IRCClient.addUserJoinHandler(myCallback)();
      expect(IRCClient.joinHandlers.has(myCallback)).to.be.false;
    });
  });

  describe('addUserRenameHandler', () => {
    beforeEach(() => {
      sandbox.replace(IRCClient, 'renameHandlers', new Set());
    });

    it('Adds the provided callback to the IRCClient renameHandlers', () => {
      const myCallback = () => 'whatever';
      IRCClient.addUserRenameHandler(myCallback);
      expect(IRCClient.renameHandlers.has(myCallback)).to.be.true;
    });

    it('Returns a function which removes the callback when called', () => {
      const myCallback = () => 'whatever';
      IRCClient.addUserRenameHandler(myCallback)();
      expect(IRCClient.renameHandlers.has(myCallback)).to.be.false;
    });
  });

  describe('addConnectHandler', () => {
    beforeEach(() => {
      sandbox.replace(IRCClient, 'connectedHandlers', new Set());
    });

    it('Adds the provided callback to the IRCClient connectedHandlers', () => {
      const myCallback = () => 'whatever';
      IRCClient.addConnectHandler(myCallback);
      expect(IRCClient.connectedHandlers.has(myCallback)).to.be.true;
    });

    it('Returns a function which removes the callback when called', () => {
      const myCallback = () => 'whatever';
      IRCClient.addConnectHandler(myCallback)();
      expect(IRCClient.connectedHandlers.has(myCallback)).to.be.false;
    });
  });

  describe('addDisconnectHandler', () => {
    beforeEach(() => {
      sandbox.replace(IRCClient, 'disconnectHandlers', new Set());
    });

    it('Adds the provided callback to the IRCClient disconnectHandlers', () => {
      const myCallback = () => 'whatever';
      IRCClient.addDisconnectHandler(myCallback);
      expect(IRCClient.disconnectHandlers.has(myCallback)).to.be.true;
    });

    it('Returns a function which removes the callback when called', () => {
      const myCallback = () => 'whatever';
      IRCClient.addDisconnectHandler(myCallback)();
      expect(IRCClient.disconnectHandlers.has(myCallback)).to.be.false;
    });
  });

  describe('IRCClient handlers', () => {
    describe('Close handler', () => {
      let closeHandler: any;
      let registeredHandler: any;
      let disconnectHandler: SinonStub;
      beforeEach(() => {
        closeHandler = IRCClient.bot.listeners('close')[0];
        registeredHandler = IRCClient.bot.listeners('registered')[1];
        disconnectHandler = sandbox.stub(IRCClient, 'handleDisconnect');
        sandbox.stub(IRCClient.bot, 'raw');
      });

      it('Does not call IRCClient handleDisconnect if not previously connected', async () => {
        await closeHandler();
        assert.notCalled(disconnectHandler);
      });

      it('Calls IRCClient handleDisconnect if previously connected', async () => {
        await registeredHandler();
        await closeHandler();
        assert.calledOnce(disconnectHandler);
      });
    });

    describe('Registered handler', () => {
      let registeredHandler: any;
      let botRawStub: SinonStub;
      beforeEach(() => {
        registeredHandler = IRCClient.bot.listeners('registered')[1];
        botRawStub = sandbox.stub(IRCClient.bot, 'raw');
      });

      it('Calls raw on bot with OPER command', async () => {
        sandbox.replace(IRCClient, 'IRC_OPER_USERNAME', 'user');
        sandbox.replace(IRCClient, 'IRC_OPER_PASSWORD', 'password');
        await registeredHandler();
        assert.calledOnceWithExactly(botRawStub, 'OPER user password');
      });
    });

    describe('Unknown command handler', () => {
      let commandHandler: any;
      let postOperStub: SinonStub;
      beforeEach(() => {
        commandHandler = IRCClient.bot.listeners('unknown command')[0];
        postOperStub = sandbox.stub(IRCClient, 'postOper');
      });

      it('Calls postOper on RPL_NOWOPER (381)', () => {
        commandHandler({ command: '381' });
        assert.calledOnce(postOperStub);
      });

      it('Does not call postOper when not RPL_NOWOPER', () => {
        commandHandler({ command: '491' });
        commandHandler({ command: '100' });
        assert.notCalled(postOperStub);
      });
    });

    describe('Userlist handler', () => {
      let userlistHandler: any;
      let handleUserListStub: SinonStub;
      beforeEach(() => {
        userlistHandler = IRCClient.bot.listeners('userlist')[0];
        handleUserListStub = sandbox.stub(IRCClient, 'handleUserList');
      });

      it('Calls handleUserList with correct parameters from USERLIST', async () => {
        await userlistHandler({ channel: 'chan', users: ['someone'] });
        assert.calledWithExactly(handleUserListStub, 'chan', ['someone']);
      });
    });

    describe('Join handler', () => {
      let joinHandler: any;
      let handleUserJoinStub: SinonStub;
      beforeEach(() => {
        joinHandler = IRCClient.bot.listeners('join')[0];
        handleUserJoinStub = sandbox.stub(IRCClient, 'handleUserJoin');
      });

      it('Calls handleUserJoin with correct parameters from JOIN', async () => {
        await joinHandler({ channel: 'chan', nick: 'someone' });
        assert.calledWithExactly(handleUserJoinStub, 'chan', 'someone');
      });
    });

    describe('Kick handler', () => {
      let kickHandler: any;
      let channelLeaveStub: SinonStub;
      beforeEach(() => {
        kickHandler = IRCClient.bot.listeners('kick')[0];
        channelLeaveStub = sandbox.stub(IRCClient, 'handleChannelLeave');
      });

      it('Calls handleChannelLeave with correct parameters', async () => {
        await kickHandler({ kicked: 'me', channel: 'chan' });
        assert.calledWithExactly(channelLeaveStub, 'chan', 'me', 'kicked');
      });
    });

    describe('Part handler', () => {
      let partHandler: any;
      let channelLeaveStub: SinonStub;
      beforeEach(() => {
        partHandler = IRCClient.bot.listeners('part')[0];
        channelLeaveStub = sandbox.stub(IRCClient, 'handleChannelLeave');
      });

      it('Calls handleChannelLeave with correct parameters', async () => {
        await partHandler({ nick: 'me', channel: 'chan' });
        assert.calledWithExactly(channelLeaveStub, 'chan', 'me', 'parted');
      });
    });

    describe('Quit handler', () => {
      let quitHandler: any;
      let handleUserLeaveStub: SinonStub;
      beforeEach(() => {
        quitHandler = IRCClient.bot.listeners('quit')[0];
        handleUserLeaveStub = sandbox.stub(IRCClient, 'handleUserLeave');
      });

      it('Calls handleUserLeave with correct parameters from QUIT', async () => {
        await quitHandler({ nick: 'someone' });
        assert.calledWithExactly(handleUserLeaveStub, 'someone');
      });
    });

    describe('Nick handler', () => {
      let nickHandler: any;
      let handleUserNewNickStub: SinonStub;
      beforeEach(() => {
        nickHandler = IRCClient.bot.listeners('nick')[0];
        handleUserNewNickStub = sandbox.stub(IRCClient, 'handleUserNewNick');
      });

      it('Calls handleUserNewNick with correct parameters from NICK', async () => {
        await nickHandler({ nick: 'someone', new_nick: 'new' });
        assert.calledWithExactly(handleUserNewNickStub, 'someone', 'new');
      });
    });

    describe('Misc handlers', () => {
      it('Nick in use handler exists', () => {
        IRCClient.bot.listeners('nick in use')[0]();
      });

      it('Debug handler exists', () => {
        IRCClient.bot.listeners('debug')[0]();
      });

      it('Raw handler exists', () => {
        IRCClient.bot.listeners('raw')[0]({});
      });
    });
  });
});
