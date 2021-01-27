import { LevelDB } from '../clients/leveldb';
import { SupportSession } from './supportSession';
import { IRCClient } from '../clients/irc';
import { getLogger } from '../logger';
const logger = getLogger('SupportSessionManager');

const ActiveSessionsKey = 'sessions::activeSessions';

export class SupportSessionManager {
  public static activeSupportSessions: { [chan: string]: SupportSession } = {};

  // Needs to be called on startup to load previously active sessions from state
  public static async initSessionManager() {
    let activeSessions = [];
    try {
      activeSessions = await LevelDB.get(ActiveSessionsKey);
    } catch (e) {
      // Ignore NotFoundError (assumes no existing sessions)
      if (e.type !== 'NotFoundError') throw e;
      SupportSessionManager.activeSupportSessions = {};
    }
    // Load all sessions from state
    for (const sessionKey of activeSessions) {
      try {
        const sessionData = await LevelDB.get(sessionKey);
        logger.info(`Resuming session in ${sessionData.chan}`);
        const session = await SupportSession.fromState(sessionData, SupportSessionManager.generateDeleteCallback(sessionData.chan));
        SupportSessionManager.activeSupportSessions[sessionData.chan] = session;
        // Check that sessions we loaded from state are still in progress
        // Note that the session will delete and clean itself up with this call if it is not
        await session.checkIfInProgress();
      } catch (e) {
        // Ignore NotFoundError (assumes session ended)
        if (e.type !== 'NotFoundError') throw e;
      }
    }
    // Remove all users from support session channels which are not currently active
    IRCClient.supportSessionChannels.forEach((chan) => {
      if (!SupportSessionManager.activeSupportSessions[chan]) {
        for (const nick of IRCClient.channelState[chan.toLowerCase()] || new Set()) {
          if (!IRCClient.isMe(nick)) IRCClient.kickUserFromChannel(chan, nick);
        }
      }
    });
  }

  public static async startSupportSession(userNick: string, staffNick: string, announce: boolean, reason: string, ip: string) {
    let chanToUse = '';
    for (const chan of IRCClient.supportSessionChannels) {
      if (!SupportSessionManager.activeSupportSessions[chan]) {
        chanToUse = chan;
        break;
      }
    }
    if (!chanToUse) throw new Error('All available support channels are in use!');
    logger.info(`Starting support session for ${userNick} with ${staffNick} in ${chanToUse}`);
    const session = SupportSession.newSession(chanToUse, staffNick, userNick, reason, SupportSessionManager.generateDeleteCallback(chanToUse));
    try {
      await session.startNewSession(ip, announce);
      // Only add this as an active support session if it was successfully started
      SupportSessionManager.activeSupportSessions[chanToUse] = session;
      await SupportSessionManager.saveToState();
    } catch (e) {
      logger.error(`Error starting new session: ${e}`);
      await session.endSession();
      throw new Error('Internal Error');
    }
  }

  public static async saveToState() {
    const activeKeys = [];
    for (const sess of Object.values(SupportSessionManager.activeSupportSessions)) {
      if (!sess.ended) activeKeys.push(sess.dbKey());
    }
    await LevelDB.put(ActiveSessionsKey, activeKeys);
  }

  private static generateDeleteCallback(channel: string) {
    return () => {
      delete SupportSessionManager.activeSupportSessions[channel];
      SupportSessionManager.saveToState();
    };
  }
}
