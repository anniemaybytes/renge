import { IRCClient } from '../clients/irc';
import { SessionManager } from '../handlers/sessionManager';
import { spaceNick, getIRCColorFunc, dateToFriendlyString } from '../utils';
import { getLogger } from '../logger';
const logger = getLogger('SessionsCommand');

const sessionsMatchRegex = /^!sessions$/i;

export function listenForStaffSessions() {
  IRCClient.addMessageHookInChannel(IRCClient.staffSupportChan, sessionsMatchRegex, async (event) => {
    logger.debug(`Staff !sessions request from nick ${event.nick}`);
    const activeSessions = Object.values(SessionManager.activeSupportSessions).filter((sess) => !sess.ended);
    if (!activeSessions.length) {
      event.reply('No active sessions');
    } else {
      activeSessions.forEach((sess) => {
        event.reply(
          `${getIRCColorFunc(sess.color)(sess.ircChannel)} - ${spaceNick(sess.staffHandlerNick)} helping ${
            sess.userClientNick
          } started ${dateToFriendlyString(new Date(sess.startTime))} reason: ${sess.reason}`
        );
      });
    }
  });
}
