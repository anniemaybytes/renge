import { IRCClient } from '../clients/irc.js';
import { QueueManager } from '../manager/queue.js';
import { SessionManager } from '../manager/session.js';

import { Logger } from '../logger.js';
const logger = Logger.get('HandleCommand');

export class HandleCommand {
  private static regex = /^!handle(?:\s+(\S+))?(?:\s+(\S.*))?$/i;

  public static register() {
    IRCClient.addMessageHookInChannel(IRCClient.staffSupportChan, HandleCommand.regex, async (event) => {
      const matches = event.message.match(HandleCommand.regex);
      if (!matches) return;
      logger.debug(`Staff !handle request from nick ${event.nick}`);
      if (matches[1] && matches[2]) {
        // 'manual' handle request with nick and reason
        try {
          await SessionManager.startSupportSession(matches[1], event.nick, false, matches[2], 'N/A');
        } catch (e) {
          return event.reply(e.message ? e.message : e.toString());
        }
      }
      const pos = matches[1] ? parseInt(matches[1]) : 1; // if a position or nick wasn't specified, default to position 1
      if (!pos || pos < 1) return event.reply('Please provide a valid position number to handle');
      try {
        if (QueueManager.queue.length === 0) throw new Error('No users are in the queue!');
        const user = QueueManager.queue[pos - 1];
        if (!user) throw new Error(`Only ${QueueManager.queue.length} user${QueueManager.queue.length === 1 ? ' is' : 's are'} in the queue!`);
        await SessionManager.startSupportSession(user.nick, event.nick, true, user.reason, user.ip);
      } catch (e) {
        return event.reply(e.message ? e.message : e.toString());
      }
    });
  }
}
