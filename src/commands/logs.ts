import { IRCClient } from '../clients/irc.js';
import { SessionHandler } from '../handlers/session.js';
import { Utils } from '../utils.js';

import { Logger } from '../logger.js';
const logger = Logger.get('LogsCommand');

export class LogsCommand {
  private static regex = /^!logs$/i;

  public static register() {
    IRCClient.addMessageHookInChannel(IRCClient.staffSupportChan, LogsCommand.regex, async (event) => {
      logger.debug(`Staff !logs request from nick ${event.nick}`);
      if (SessionHandler.previousLogs.length === 0) return event.reply('No previous logs found!');
      SessionHandler.previousLogs.forEach((prevLog, i) => {
        event.reply(
          `${i + 1}. Conversation between ${prevLog.user} and ${Utils.space(prevLog.staff)} at ${Utils.dateToFriendlyString(prevLog.time)}: ${
            prevLog.paste
          }`
        );
      });
    });
  }
}
