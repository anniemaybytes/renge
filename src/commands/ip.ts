import { IRCClient } from '../clients/irc';
import { QueueManager } from '../handlers/queueManager';
import { SessionManager } from '../handlers/sessionManager';
import { getLogger } from '../logger';
const logger = getLogger('IPCommand');

const ipMatchRegex = /^!ip\s+(\S+)$/i;

export function listenForStaffIP() {
  IRCClient.addMessageHookInChannel(IRCClient.staffSupportChan, ipMatchRegex, async (event) => {
    const matches = event.message.match(ipMatchRegex);
    if (!matches) return;
    logger.debug(`Staff !ip request from nick ${event.nick}`);
    const nickLower = matches[1].toLowerCase();
    const inActiveSession = Object.values(SessionManager.activeSupportSessions).some(
      (sess) => !sess.ended && sess.userClientNick.toLowerCase() === nickLower
    );
    const inQueue = QueueManager.isInQueue(nickLower);
    if (inActiveSession || inQueue) {
      try {
        IRCClient.notice(event.nick, `${matches[1]}'s IP is ${(await IRCClient.whois(matches[1])).actual_ip || 'Unavailable'}`);
      } catch (e) {
        logger.error(e);
        event.reply('An internal error has occured, please notify sysop');
      }
    } else {
      event.reply(`${matches[1]} is not in the queue nor in an active session!`);
    }
  });
}
