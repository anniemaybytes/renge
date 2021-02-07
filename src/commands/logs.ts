import { IRCClient } from '../clients/irc';
import { SessionHandler } from '../handlers/sessionHandler';
import { spaceNick, dateToFriendlyString } from '../utils';
import { getLogger } from '../logger';
const logger = getLogger('LogsCommand');

const logMatchRegex = /^!logs/i;

export function listenForStaffLogs() {
  IRCClient.addMessageHookInChannel(IRCClient.staffSupportChan, logMatchRegex, async (event) => {
    logger.debug(`Staff !logs request from nick ${event.nick}`);
    if (SessionHandler.previousLogs.length === 0) return event.reply('No previous logs found!');
    SessionHandler.previousLogs.forEach((prevLog, i) => {
      event.reply(
        `${i + 1}. Conversation between ${prevLog.user} and ${spaceNick(prevLog.staff)} at ${dateToFriendlyString(prevLog.time)}: ${prevLog.paste}`
      );
    });
  });
}
