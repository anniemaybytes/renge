import { IRCClient } from '../clients/irc.js';
import { SessionManager } from '../manager/session.js';

import { Logger } from '../logger.js';
const logger = Logger.get('KillCommand');

export class KillCommand {
  private static regex = /^!kill\s+(\S+)$/i;

  public static register() {
    IRCClient.addMessageHookInChannel(IRCClient.staffSupportChan, KillCommand.regex, async (event) => {
      const matches = event.message.match(KillCommand.regex);
      if (!matches) return;
      logger.debug(`Staff !kill request from nick ${event.nick}`);
      const chanLower = matches[1].toLowerCase();
      const sessions = Object.values(SessionManager.activeSupportSessions).filter(
        (sess) => !sess.ended && sess.ircChannel.toLowerCase() === chanLower,
      );
      if (!sessions.length) {
        event.reply(`${matches[1]} is not a valid active session!`);
      } else {
        try {
          await Promise.all(sessions.map(async (sess) => await sess.endSession()));
          event.reply(`${matches[1]} session has been ended`);
        } catch (e) {
          logger.error(`Error killing session: ${e}`);
          event.reply('There was an unexpected error killing the session. Please try again');
        }
      }
    });
  }
}
