import { LevelDB } from '../clients/leveldb';
import { IRCClient } from '../clients/irc';
import { sleep } from '../utils';
import type { QueuedUser } from '../types';

const QueueKey = 'queue::queuedUsers';

export class SupportQueue {
  public static queue: QueuedUser[] = [];
  public static unqueuedUsers: { [lowerNick: string]: NodeJS.Timeout } = {};

  private static isUserSupportChannel(chan: string) {
    return IRCClient.userSupportChan.toLowerCase() === chan.toLowerCase();
  }

  public static isInQueue(nick: string) {
    const nickLower = nick.toLowerCase();
    return SupportQueue.queue.some((user) => user.nick.toLowerCase() === nickLower);
  }

  private static removeUnqueuedUser(nick: string) {
    const nickLower = nick.toLowerCase();
    if (SupportQueue.unqueuedUsers[nickLower]) {
      clearTimeout(SupportQueue.unqueuedUsers[nickLower]);
      delete SupportQueue.unqueuedUsers[nickLower];
    }
  }

  // Needs to be called on startup to set up callbacks in the IRC client and load queue from state
  // Note that this needs to be called after LevelDB has been init, but before IRC connects
  public static async initQueue() {
    await SupportQueue.loadQueueFromState();
    // Set up IRC client callbacks
    IRCClient.addUserRenameHandler(SupportQueue.renameUser);
    IRCClient.addUserJoinHandler(SupportQueue.userJoinHandler);
    IRCClient.addUserLeaveHandler(async (nick, chan) => {
      if (SupportQueue.isUserSupportChannel(chan)) {
        // remove the user from the support/unqueued lists if they are in them
        SupportQueue.removeUnqueuedUser(nick);
        try {
          await SupportQueue.unqueueUser(undefined, nick);
        } catch {} // eslint-disable-line no-empty
      }
    });
    IRCClient.addDisconnectHandler(() => {
      // Remove all unqueued users when disconnecting from IRC
      Object.keys(SupportQueue.unqueuedUsers).forEach(SupportQueue.removeUnqueuedUser);
    });
    IRCClient.addConnectHandler(SupportQueue.nowConnected);
  }

  public static async nowConnected() {
    // Fetch the nicks in the support channel
    const nicksInSupportChannel = IRCClient.channelState[IRCClient.userSupportChan.toLowerCase()] || new Set();
    // Create a new queue consisting of previously queued users who are still in the support channel
    const newQueue: QueuedUser[] = [];
    SupportQueue.queue.forEach((user) => {
      if (nicksInSupportChannel.has(user.nick.toLowerCase())) newQueue.push(user);
    });
    SupportQueue.queue = newQueue;
    await SupportQueue.saveQueueToState();
    // Add users in the support channel who are not in the queue as unqueued
    for (const user of nicksInSupportChannel) {
      if (!IRCClient.isMe(user) && !SupportQueue.isInQueue(user)) SupportQueue.addUnqueuedUser(user);
    }
  }

  public static async userJoinHandler(nick: string, channel: string) {
    if (SupportQueue.isUserSupportChannel(channel)) {
      if (await IRCClient.isStaff(nick)) return;
      // Send welcome message to newly joined user
      IRCClient.message(
        IRCClient.userSupportChan,
        `Hi ${nick}! If you need your account re-enabled please type !reenable <your username>. Otherwise please enter the support queue with !queue <reason you need assistance>.`
      );
      // Sleep to allow chanserv or whatnot to add op before adding unqueued user which checks for channel op status
      await sleep(5000);
      await SupportQueue.addUnqueuedUser(nick);
    }
  }

  public static async addUnqueuedUser(nick: string) {
    const nickLower = nick.toLowerCase();
    // nick will not be added as unqueued if they are staff, user support channel op, or not in the user support channel
    if (
      !IRCClient.channelState[IRCClient.userSupportChan.toLowerCase()]?.has(nickLower) ||
      (await IRCClient.isStaff(nick)) ||
      (await IRCClient.isChannelOp(IRCClient.userSupportChan, nick))
    )
      return;
    const existingTimeout = SupportQueue.unqueuedUsers[nickLower];
    if (existingTimeout) clearTimeout(existingTimeout);
    // Create a timeout which triggers after 5 minutes warning user to queue, then after another 15 minutes kicking the user
    SupportQueue.unqueuedUsers[nickLower] = setTimeout(() => {
      IRCClient.message(
        IRCClient.userSupportChan,
        `Hi ${nick}, we do not allow idling in support channels. Please queue with !queue <reason> or part the channel.`
      );
      SupportQueue.unqueuedUsers[nickLower] = setTimeout(() => IRCClient.kickUserFromChannel(IRCClient.userSupportChan, nick), 900000);
    }, 300000);
  }

  public static async renameUser(oldNick: string, newNick: string) {
    // Update this renamed user if they are in the queue
    const oldNickLower = oldNick.toLowerCase();
    for (const user of SupportQueue.queue) {
      if (user.nick.toLowerCase() === oldNickLower) {
        user.nick = newNick;
        await SupportQueue.saveQueueToState();
        return;
      }
    }
    // Update this renamed user if they are unqueued
    if (SupportQueue.unqueuedUsers[oldNickLower]) {
      SupportQueue.unqueuedUsers[newNick.toLowerCase()] = SupportQueue.unqueuedUsers[oldNickLower];
      delete SupportQueue.unqueuedUsers[oldNickLower];
    }
  }

  // Returns false if user is already queued or true if newly queued
  public static async queueUser(nick: string, reason: string) {
    SupportQueue.removeUnqueuedUser(nick);
    if (SupportQueue.isInQueue(nick)) return false;
    const ircUser = await IRCClient.whois(nick);
    SupportQueue.queue.push({ nick, reason, time: new Date(), ip: ircUser.actual_ip || 'Unavailable' });
    await SupportQueue.saveQueueToState();
    IRCClient.message(IRCClient.staffSupportChan, `User ${nick} requires support: ${reason}`);
    return true;
  }

  // Get a user from the queue either by index or nick (or top of queue if neither)
  public static async unqueueUser(index = 0, nick = '') {
    if (index && nick) throw new Error('Only one of index or nick can be used for unqueue');
    if (nick) {
      const nickLower = nick.toLowerCase();
      index = SupportQueue.queue.findIndex((user) => user.nick.toLowerCase() === nickLower);
      if (index === -1) throw new Error(`${nick} not in queue!`);
    }
    if (index >= SupportQueue.queue.length) throw new Error(`Only ${SupportQueue.queue.length} users are in queue!`);
    const user = SupportQueue.queue.splice(index, 1)[0];
    await SupportQueue.saveQueueToState();
    return user;
  }

  private static async saveQueueToState() {
    await LevelDB.put(QueueKey, SupportQueue.queue);
  }

  private static async loadQueueFromState() {
    try {
      const queueState = await LevelDB.get(QueueKey);
      SupportQueue.queue = queueState.map((user: any) => {
        return { nick: user.nick, reason: user.reason, time: new Date(user.time), ip: user.ip };
      });
    } catch (e) {
      // Ignore NotFoundError (assumes new empty queue)
      if (e.type !== 'NotFoundError') throw e;
      SupportQueue.queue = [];
    }
  }
}
