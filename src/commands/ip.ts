import { IRCClient } from '../clients/irc.js';
import { QueueManager } from '../manager/queue.js';
import { SessionManager } from '../manager/session.js';

import { Logger } from '../logger.js';
const logger = Logger.get('IPCommand');

export class IPCommand {
  private static regex = /^!ip\s+(\S+)$/i;

  public static register() {
    IRCClient.addMessageHookInChannel(IRCClient.staffSupportChan, IPCommand.regex, async (event) => {
      const matches = event.message.match(IPCommand.regex);
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
}
