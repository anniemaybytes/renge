import { LevelDB } from '../clients/leveldb';
import { IRCClient } from '../clients/irc';
import { sleep } from '../utils';
import type { QueuedUser } from '../types';

const QueueKey = 'queue::queuedUsers';

export class QueueManager {
  public static queue: QueuedUser[] = [];
  public static unqueuedUsers: { [lowerNick: string]: NodeJS.Timeout } = {};

  private static isUserSupportChannel(chan: string) {
    return IRCClient.userSupportChan.toLowerCase() === chan.toLowerCase();
  }

  public static isInQueue(nick: string) {
    const nickLower = nick.toLowerCase();
    return QueueManager.queue.some((user) => user.nick.toLowerCase() === nickLower);
  }

  private static removeUnqueuedUser(nick: string) {
    const nickLower = nick.toLowerCase();
    if (QueueManager.unqueuedUsers[nickLower]) {
      clearTimeout(QueueManager.unqueuedUsers[nickLower]);
      delete QueueManager.unqueuedUsers[nickLower];
    }
  }

  // Needs to be called on startup to set up callbacks in the IRC client and load queue from state
  // Note that this needs to be called after LevelDB has been init, but before IRC connects
  public static async initQueue() {
    await QueueManager.loadQueueFromState();
    // Set up IRC client callbacks
    IRCClient.addUserRenameHandler(QueueManager.renameUser);
    IRCClient.addUserJoinHandler(QueueManager.userJoinHandler);
    IRCClient.addUserLeaveHandler(async (nick, chan) => {
      if (QueueManager.isUserSupportChannel(chan)) {
        // remove the user from the support/unqueued lists if they are in them
        QueueManager.removeUnqueuedUser(nick);
        try {
          await QueueManager.unqueueUser(undefined, nick);
        } catch {} // eslint-disable-line no-empty
      }
    });
    IRCClient.addDisconnectHandler(() => {
      // Remove all unqueued users when disconnecting from IRC
      Object.keys(QueueManager.unqueuedUsers).forEach(QueueManager.removeUnqueuedUser);
    });
    IRCClient.addConnectHandler(QueueManager.nowConnected);
  }

  public static async nowConnected() {
    // Fetch the nicks in the support channel
    const nicksInSupportChannel = IRCClient.channelState[IRCClient.userSupportChan.toLowerCase()] || new Set();
    // Create a new queue consisting of previously queued users who are still in the support channel
    const newQueue: QueuedUser[] = [];
    QueueManager.queue.forEach((user) => {
      if (nicksInSupportChannel.has(user.nick.toLowerCase())) newQueue.push(user);
    });
    QueueManager.queue = newQueue;
    await QueueManager.saveQueueToState();
    // Add users in the support channel who are not in the queue as unqueued
    for (const user of nicksInSupportChannel) {
      if (!IRCClient.isMe(user) && !QueueManager.isInQueue(user)) QueueManager.addUnqueuedUser(user);
    }
  }

  public static async userJoinHandler(nick: string, channel: string) {
    if (QueueManager.isUserSupportChannel(channel)) {
      if (await IRCClient.isStaff(nick)) return;
      // Send welcome message to newly joined user
      IRCClient.message(
        IRCClient.userSupportChan,
        `Hi ${nick}! If you need your account re-enabled please type !reenable <your username>. Otherwise please enter the support queue with !queue <reason you need assistance>.`
      );
      // Sleep to allow chanserv or whatnot to add op before adding unqueued user which checks for channel op status
      await sleep(5000);
      await QueueManager.addUnqueuedUser(nick);
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
    const existingTimeout = QueueManager.unqueuedUsers[nickLower];
    if (existingTimeout) clearTimeout(existingTimeout);
    // Create a timeout which triggers after 5 minutes warning user to queue, then after another 15 minutes kicking the user
    QueueManager.unqueuedUsers[nickLower] = setTimeout(() => {
      IRCClient.message(
        IRCClient.userSupportChan,
        `Hi ${nick}, we do not allow idling in the support channel. If you need your account re-enabled please type !reenable <your username>. Otherwise please enter the support queue with !queue <reason you need assistance>.` // eslint-disable-line max-len
      );
      QueueManager.unqueuedUsers[nickLower] = setTimeout(() => IRCClient.kickUserFromChannel(IRCClient.userSupportChan, nick), 900000);
    }, 300000);
  }

  public static async renameUser(oldNick: string, newNick: string) {
    // Update this renamed user if they are in the queue
    const oldNickLower = oldNick.toLowerCase();
    for (const user of QueueManager.queue) {
      if (user.nick.toLowerCase() === oldNickLower) {
        user.nick = newNick;
        await QueueManager.saveQueueToState();
        return;
      }
    }
    // Update this renamed user if they are unqueued
    if (QueueManager.unqueuedUsers[oldNickLower]) {
      QueueManager.unqueuedUsers[newNick.toLowerCase()] = QueueManager.unqueuedUsers[oldNickLower];
      delete QueueManager.unqueuedUsers[oldNickLower];
    }
  }

  // Returns false if user is already queued or true if newly queued
  public static async queueUser(nick: string, reason: string) {
    QueueManager.removeUnqueuedUser(nick);
    if (QueueManager.isInQueue(nick)) return false;
    const ircUser = await IRCClient.whois(nick);
    QueueManager.queue.push({ nick, reason, time: new Date(), ip: ircUser.actual_ip || 'Unavailable' });
    await QueueManager.saveQueueToState();
    IRCClient.message(IRCClient.staffSupportChan, `User ${nick} requires support: ${reason}`);
    return true;
  }

  // Get a user from the queue either by index or nick (or top of queue if neither)
  public static async unqueueUser(index = 0, nick = '') {
    if (index && nick) throw new Error('Only one of index or nick can be used for unqueue');
    if (QueueManager.queue.length === 0) throw new Error('No users are in the queue!');
    if (nick) {
      const nickLower = nick.toLowerCase();
      index = QueueManager.queue.findIndex((user) => user.nick.toLowerCase() === nickLower);
      if (index === -1) throw new Error(`${nick} is not in the queue!`);
    }
    if (index >= QueueManager.queue.length)
      throw new Error(`Only ${QueueManager.queue.length} user${QueueManager.queue.length === 1 ? ' is' : 's are'} in the queue!`);
    const user = QueueManager.queue.splice(index, 1)[0];
    await QueueManager.saveQueueToState();
    return user;
  }

  private static async saveQueueToState() {
    await LevelDB.put(QueueKey, QueueManager.queue);
  }

  private static async loadQueueFromState() {
    try {
      const queueState = await LevelDB.get(QueueKey);
      QueueManager.queue = queueState.map((user: any) => {
        return { nick: user.nick, reason: user.reason, time: new Date(user.time), ip: user.ip };
      });
    } catch (e) {
      // Ignore NotFoundError (assumes new empty queue)
      if (e.type !== 'NotFoundError') throw e;
      QueueManager.queue = [];
    }
  }
}
