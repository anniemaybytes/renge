import * as irc from 'irc-framework';
import { promisify } from 'util';

import { Utils } from '../utils.js';
import { Config } from './config.js';
import {
  MessageEvent,
  WHOResponse,
  WHOISResponse,
  JoinHandler,
  LeaveHandler,
  DisconnectHandler,
  ConnectedHandler,
  RenameHandler,
  ChannelState,
} from '../types.js';

import { Logger } from '../logger.js';
const logger = Logger.get('IRCClient');

const ircClient = new irc.Client({ auto_reconnect: false });
ircClient.who[promisify.custom] = (target: string) =>
  new Promise((resolve, reject) => {
    // If who call takes longer than 10 seconds, consider it a failure
    setTimeout(() => reject(new Error('WHO took too long, maybe room is empty?')), 10000);
    ircClient.who(target, resolve);
  });
ircClient.whois[promisify.custom] = (target: string) =>
  new Promise((resolve, reject) => {
    // If whois call takes longer than 2 seconds, consider it a failure
    setTimeout(() => reject(new Error('WHOIS took too long, nick is probably offline')), 2000);
    ircClient.whois(target, resolve);
  });
const configFile = Config.get();

export class IRCClient {
  public static IRC_NICK = configFile.irc_nick || 'renge';
  public static IRC_SERVER = configFile.irc_server || 'localhost';
  public static IRC_PORT = Number(configFile.irc_port) || 6667;
  public static IRC_USERNAME = configFile.irc_username || 'renge';
  public static IRC_REALNAME = configFile.irc_realname || 'renge';
  public static IRC_USE_SSL = configFile.irc_use_ssl === undefined ? false : Boolean(configFile.irc_use_ssl);
  public static IRC_VERIFY_SSL = configFile.irc_verify_ssl === undefined ? true : Boolean(configFile.irc_verify_ssl);
  public static IRC_OPER_USERNAME = configFile.oper_username || 'oper';
  public static IRC_OPER_PASSWORD = configFile.oper_pass || 'pass';
  public static staffSupportChan = configFile.staff_channel || '#staff-support';
  public static userSupportChan = configFile.user_channel || '#user-support';
  public static supportLogChan = configFile.log_channel || '#support-logging';
  public static supportSessionChannels = configFile.session_channels || ['#support-session1'];
  public static staffHostMasks = configFile.staff_hostmasks || ['*!*@*']; // default assumes all are staff
  public static registered = false; // Whether or not the irc client is registered with oper permissions
  public static joined = false; // Whether or not we have finished joining all of the channels after registration
  public static shuttingDown = false;
  public static bot = ircClient;
  // Keeps track of users in channels
  public static channelState: ChannelState = {};
  // Keeps track of external handlers for certain events
  public static renameHandlers: RenameHandler = new Set();
  public static joinHandlers: JoinHandler = new Set();
  public static leaveHandlers: LeaveHandler = new Set();
  public static disconnectHandlers: DisconnectHandler = new Set();
  public static connectedHandlers: ConnectedHandler = new Set();

  private static bot_who = promisify(ircClient.who).bind(ircClient);
  private static bot_whois = promisify(ircClient.whois).bind(ircClient);

  public static isMe(nick: string) {
    return nick.toLowerCase() === IRCClient.IRC_NICK.toLowerCase();
  }

  public static checkIfRegistered() {
    if (!IRCClient.registered) throw new Error('IRC Bot is not yet registered!');
  }

  public static mainChannels() {
    return [IRCClient.staffSupportChan, IRCClient.userSupportChan, IRCClient.supportLogChan];
  }

  // This function is intended to be called without awaiting on startup, as it will never return unless shutting down,
  // continually trying to reconnect to IRC when necessary
  public static async connect() {
    while (!IRCClient.shuttingDown) {
      if (!IRCClient.registered) {
        IRCClient.bot.quit();
        logger.info(`Attempting to connect to IRC at ${IRCClient.IRC_SERVER}:${IRCClient.IRC_USE_SSL ? '+' : ''}${IRCClient.IRC_PORT}`);
        IRCClient.bot.connect({
          host: IRCClient.IRC_SERVER,
          port: IRCClient.IRC_PORT,
          nick: IRCClient.IRC_NICK,
          username: IRCClient.IRC_USERNAME,
          gecos: IRCClient.IRC_REALNAME,
          ssl: IRCClient.IRC_USE_SSL,
          rejectUnauthorized: IRCClient.IRC_VERIFY_SSL,
        });
      }
      await Utils.sleep(5000);
    }
  }

  public static shutDown() {
    IRCClient.shuttingDown = true;
    IRCClient.bot.quit();
  }

  // Stuff to do after gaining OPER priveleges
  public static async postOper() {
    logger.debug('Oper privileges gained');
    IRCClient.registered = true;
    IRCClient.rawCommand('MODE', IRCClient.IRC_NICK, '+B');
    IRCClient.rawCommand('CHGHOST', IRCClient.IRC_NICK, 'bakus.dungeon');
    for (const chan of IRCClient.mainChannels()) {
      await IRCClient.joinChannel(chan);
    }
    for (const chan of IRCClient.supportSessionChannels) {
      await IRCClient.joinChannel(chan);
      IRCClient.setUpSessionChannel(chan);
    }
    IRCClient.connectedHandlers.forEach((cb) => cb());
    IRCClient.joined = true;
  }

  public static setUpSessionChannel(channel: string) {
    IRCClient.rawCommand('SAMODE', channel, '+o', IRCClient.IRC_NICK);
    IRCClient.rawCommand('MODE', channel, '+ins');
    IRCClient.staffHostMasks.forEach((hostMask) => IRCClient.rawCommand('MODE', channel, '+I', hostMask));
  }

  // Join a room and detect/throw for failure
  public static async joinChannel(channel: string) {
    return new Promise<void>((resolve, reject) => {
      if (IRCClient.channelState[channel.toLowerCase()]) return resolve(); // already in channel
      // If joining takes longer than 5 seconds, consider it a failure
      const timeout = setTimeout(() => reject(new Error(`Unable to join channel ${channel}`)), 5000);

      function channelUserListHandler(event: any) {
        if (event.channel.toLowerCase() === channel.toLowerCase()) {
          clearTimeout(timeout);
          resolve();
        }
      }

      IRCClient.bot.on('userlist', channelUserListHandler);
      IRCClient.rawCommand('SAJOIN', IRCClient.IRC_NICK, channel);
      // Cleanup userlist handler
      setTimeout(() => IRCClient.bot.removeListener('userlist', channelUserListHandler), 5001);
    });
  }

  // Join another user to a channel and detect/throw for failure. Must already be in room
  public static async joinUserToChannel(channel: string, nick: string) {
    return new Promise<void>((resolve, reject) => {
      if (IRCClient.isMe(nick)) return reject(new Error('Should not be using joinUserToChannel with self'));
      // This restriction of needing to be in the room is so that we can use the JOIN message to
      // detect if the SAJOIN was successful or not which we do not get if we are not in the room.
      if (!IRCClient.channelState[channel.toLowerCase()]) return reject(new Error('Cannot join user to channel which I am not currently in'));
      if (IRCClient.channelState[channel.toLowerCase()].has(nick.toLowerCase())) return resolve(); // user is already in the channel
      const timeout = setTimeout(() => reject(new Error(`Unable to SAJOIN ${nick} to ${channel}`)), 5000);

      function joinHandler(event: any) {
        if (event.channel.toLowerCase() === channel.toLowerCase() && event.nick.toLowerCase() === nick.toLowerCase()) {
          clearTimeout(timeout);
          resolve();
        }
      }

      IRCClient.bot.on('join', joinHandler);
      IRCClient.rawCommand('SAJOIN', nick, channel);
      // Cleanup join handler
      setTimeout(() => IRCClient.bot.removeListener('join', joinHandler), 5001);
    });
  }

  public static async isChannelOp(channel: string, nick: string) {
    const nickLower = nick.toLowerCase();
    const whoResponse = await IRCClient.who(channel);
    for (const whoUser of whoResponse) {
      if (whoUser.nick.toLowerCase() === nickLower) {
        return whoUser.channel_modes.includes('o');
      }
    }
    // didn't find specified nick in channel
    return false;
  }

  public static async isStaff(nick: string) {
    const whoIsResponse = await IRCClient.whois(nick);
    return IRCClient.staffHostMasks.some((hostMask) =>
      Utils.matchIRCHostMask(hostMask, whoIsResponse.nick, whoIsResponse.ident, whoIsResponse.hostname),
    );
  }

  // Blindly part a user from a channel with SAPART. Does not check for success
  public static partUserFromChannel(channel: string, nick: string) {
    IRCClient.rawCommand('SAPART', nick, channel);
  }

  public static async waitUntilJoined() {
    while (!IRCClient.joined) await Utils.sleep(100);
  }

  public static rawCommand(...command: string[]) {
    IRCClient.checkIfRegistered();
    logger.trace(command);
    IRCClient.bot.raw(IRCClient.bot.rawString(command));
  }

  public static async who(target: string) {
    IRCClient.checkIfRegistered();
    const response = await IRCClient.bot_who(target);
    return response.users as WHOResponse[];
  }

  public static async whois(nick: string) {
    IRCClient.checkIfRegistered();
    const response = await IRCClient.bot_whois(nick);
    return response as WHOISResponse;
  }

  public static message(target: string, message: string) {
    IRCClient.checkIfRegistered();
    logger.trace(`Sending msg to ${target} | msg: ${message}`);
    message.split('\n').forEach((msg) => IRCClient.bot.say(target, msg));
  }

  public static notice(target: string, message: string) {
    IRCClient.checkIfRegistered();
    logger.trace(`Sending notice to ${target} | msg: ${message}`);
    message.split('\n').forEach((msg) => IRCClient.bot.notice(target, msg));
  }

  public static async handleUserJoin(channel: string, nick: string) {
    if (IRCClient.isMe(nick)) return;
    logger.debug(`${nick} joined ${channel}`);
    IRCClient.channelState[channel.toLowerCase()].add(nick.toLowerCase());
    IRCClient.joinHandlers.forEach((cb) => cb(nick, channel));
  }

  public static async handleChannelLeave(channel: string, nick: string, leaveType: 'kicked' | 'parted') {
    if (IRCClient.isMe(nick)) {
      logger.warn(`Unexpectedly left channel ${channel}`);
      delete IRCClient.channelState[channel.toLowerCase()];
      // Try to rejoin if it was a channel where we should exist
      if ([...IRCClient.mainChannels(), ...IRCClient.supportSessionChannels].some((chan) => chan.toLowerCase() === channel.toLowerCase()))
        await IRCClient.joinChannel(channel);
    } else {
      logger.debug(`${nick} left ${channel}`);
      IRCClient.channelState[channel.toLowerCase()].delete(nick.toLowerCase());
      IRCClient.leaveHandlers.forEach((cb) => cb(nick, channel, leaveType));
    }
  }

  public static async handleUserLeave(nick: string) {
    logger.debug(`${nick} quit`);
    Object.entries(IRCClient.channelState).forEach(([channel, users]) => {
      if (users.delete(nick.toLowerCase())) IRCClient.leaveHandlers.forEach((cb) => cb(nick, channel, 'quit'));
    });
  }

  public static handleUserList(channel: string, users: any[]) {
    IRCClient.channelState[channel.toLowerCase()] = new Set(users.map((user) => user.nick.toLowerCase()));
    logger.info(`Joined ${channel}`);
  }

  public static handleUserNewNick(oldNick: string, newNick: string) {
    logger.debug(`${oldNick} changed nick to ${newNick}`);
    Object.values(IRCClient.channelState).forEach((users) => {
      if (users.delete(oldNick.toLowerCase())) users.add(newNick.toLowerCase());
    });
    IRCClient.renameHandlers.forEach((cb) => cb(oldNick, newNick));
  }

  public static handleDisconnect() {
    if (!IRCClient.shuttingDown) logger.error('Disconnected from IRC server!');
    IRCClient.registered = false;
    IRCClient.joined = false;
    IRCClient.channelState = {};
    IRCClient.disconnectHandlers.forEach((cb) => cb());
  }

  // Used for pre-processing before passing off to user callback,
  // Not meant to be called directly. Only public for testing purposes
  public static callbackWrapper(channel: string, callback: (event: MessageEvent) => any) {
    const channelLower = channel.toLowerCase();
    return (event: MessageEvent) => {
      if (channelLower === event.target.toLowerCase()) callback(event);
    };
  }

  // Returns a function which can be called to remove the added listener
  public static addMessageHookInChannel(channel: string, regex: RegExp, callback: (event: MessageEvent) => any) {
    return IRCClient.bot.matchMessage(regex, IRCClient.callbackWrapper(channel, callback)).stop as () => void;
  }

  public static addUserLeaveHandler(callback: (nick: string, channel: string, leaveType: 'kicked' | 'parted' | 'quit') => any) {
    IRCClient.leaveHandlers.add(callback);
    return () => IRCClient.leaveHandlers.delete(callback);
  }

  public static addUserJoinHandler(callback: (nick: string, channel: string) => any) {
    IRCClient.joinHandlers.add(callback);
    return () => IRCClient.joinHandlers.delete(callback);
  }

  public static addUserRenameHandler(callback: (oldNick: string, newNick: string) => any) {
    IRCClient.renameHandlers.add(callback);
    return () => IRCClient.renameHandlers.delete(callback);
  }

  public static addConnectHandler(callback: () => any) {
    IRCClient.connectedHandlers.add(callback);
    return () => IRCClient.connectedHandlers.delete(callback);
  }

  public static addDisconnectHandler(callback: () => any) {
    IRCClient.disconnectHandlers.add(callback);
    return () => IRCClient.disconnectHandlers.delete(callback);
  }
}

let connected = false;
ircClient.on('close', () => {
  if (connected) {
    connected = false;
    IRCClient.handleDisconnect();
  }
});

ircClient.on('registered', async () => {
  connected = true;
  logger.info('Successfully connected to IRC server');
  if (!IRCClient.IRC_VERIFY_SSL && IRCClient.IRC_USE_SSL) logger.warn(`Connection was established on secure channel without TLS peer verification`);
  IRCClient.bot.raw(IRCClient.bot.rawString('OPER', IRCClient.IRC_OPER_USERNAME, IRCClient.IRC_OPER_PASSWORD));
});

ircClient.on('unknown command', (command: any) => {
  if (command.command === '381') IRCClient.postOper();
  else if (command.command === '491') logger.error('Registering as oper has failed; possibly bad O:LINE password?');
});

ircClient.on('userlist', (event: any) => {
  IRCClient.handleUserList(event.channel, event.users);
});

ircClient.on('join', async (event: any) => {
  await IRCClient.handleUserJoin(event.channel, event.nick);
});

ircClient.on('kick', async (event: any) => {
  await IRCClient.handleChannelLeave(event.channel, event.kicked, 'kicked');
});

ircClient.on('part', async (event: any) => {
  await IRCClient.handleChannelLeave(event.channel, event.nick, 'parted');
});

ircClient.on('quit', async (event: any) => {
  await IRCClient.handleUserLeave(event.nick);
});

ircClient.on('nick', (event: any) => {
  IRCClient.handleUserNewNick(event.nick, event.new_nick);
});

ircClient.on('nick in use', () => {
  logger.error(`Attempted nickname ${IRCClient.IRC_NICK} is currently in use; will retry`);
});

ircClient.on('debug', (event: string) => {
  logger.debug(event);
});

ircClient.on('raw', (event: any) => {
  if (event.from_server) logger.trace(event.line);
});
