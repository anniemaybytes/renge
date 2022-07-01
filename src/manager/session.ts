import { LevelDB } from '../clients/leveldb.js';
import { SessionHandler } from '../handlers/session.js';
import { IRCClient } from '../clients/irc.js';

import { Logger } from '../logger.js';
const logger = Logger.get('SessionManager');

const ActiveSessionsKey = 'sessions::activeSessions';

export class SessionManager {
  public static activeSupportSessions: { [chan: string]: SessionHandler } = {};

  // Needs to be called on startup to load previously active sessions from state
  public static async start() {
    await SessionHandler.initPreviousLogs();
    let activeSessions = [];
    try {
      activeSessions = await LevelDB.get(ActiveSessionsKey);
    } catch (e) {
      // Ignore NotFoundError (assumes no existing sessions)
      if (e.code !== 'LEVEL_NOT_FOUND') throw e;
      SessionManager.activeSupportSessions = {};
    }
    // Load all sessions from state
    for (const sessionKey of activeSessions) {
      try {
        const sessionData = await LevelDB.get(sessionKey);
        logger.info(`Resuming session in ${sessionData.chan}`);
        const session = await SessionHandler.fromState(sessionData, SessionManager.generateDeleteCallback(sessionData.chan));
        SessionManager.activeSupportSessions[sessionData.chan] = session;
        // Check that sessions we loaded from state are still in progress
        // Note that the session will delete and clean itself up with this call if it is not
        await session.checkIfInProgress();
      } catch (e) {
        // Ignore NotFoundError (assumes session ended)
        if (e.code !== 'LEVEL_NOT_FOUND') throw e;
      }
    }
    // Remove all users from support session channels which are not currently active
    IRCClient.supportSessionChannels.forEach((chan) => {
      if (!SessionManager.activeSupportSessions[chan]) {
        for (const nick of IRCClient.channelState[chan.toLowerCase()] || new Set()) {
          if (!IRCClient.isMe(nick)) IRCClient.partUserFromChannel(chan, nick);
        }
      }
    });
  }

  public static async startSupportSession(userNick: string, staffNick: string, announce: boolean, reason: string, ip: string) {
    let chanToUse = '';
    for (const chan of IRCClient.supportSessionChannels) {
      if (!SessionManager.activeSupportSessions[chan]) {
        chanToUse = chan;
        break;
      }
    }
    if (!chanToUse) throw new Error('All available support channels are in use!');
    logger.info(`Starting support session for ${userNick} with ${staffNick} in ${chanToUse}`);
    const session = SessionHandler.newSession(chanToUse, staffNick, userNick, reason, SessionManager.generateDeleteCallback(chanToUse));
    try {
      await session.startNewSession(ip, announce);
      // Only add this as an active support session if it was successfully started
      SessionManager.activeSupportSessions[chanToUse] = session;
      await SessionManager.saveToState();
    } catch (e) {
      logger.error(`Error starting new session: ${e}`);
      await session.endSession();
      throw new Error('Internal Error');
    }
  }

  public static async saveToState() {
    const activeKeys = [];
    for (const sess of Object.values(SessionManager.activeSupportSessions)) {
      if (!sess.ended) activeKeys.push(sess.dbKey());
    }
    await LevelDB.put(ActiveSessionsKey, activeKeys);
  }

  private static generateDeleteCallback(channel: string) {
    return () => {
      delete SessionManager.activeSupportSessions[channel];
      SessionManager.saveToState();
    };
  }
}
