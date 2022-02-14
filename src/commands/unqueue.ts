import { IRCClient } from '../clients/irc.js';
import { QueueManager } from '../manager/queue.js';

import { Logger } from '../logger.js';
const logger = Logger.get('UnqueueCommand');

export class UnqueueCommand {
  private static regex = /^!unqueue(?:\s+(\S+))?$/i;

  public static register() {
    IRCClient.addMessageHookInChannel(IRCClient.userSupportChan, UnqueueCommand.regex, async (event) => {
      logger.debug(`User !unqueue request from nick ${event.nick}`);
      try {
        await QueueManager.unqueueUserByNick(event.nick, false);
        QueueManager.addUnqueuedUser(event.nick);
        return event.reply("You've been removed from the queue!");
      } catch (e) {
        return event.reply("You're not in the queue!");
      }
    });

    IRCClient.addMessageHookInChannel(IRCClient.staffSupportChan, UnqueueCommand.regex, async (event) => {
      const matches = event.message.match(UnqueueCommand.regex);
      if (!matches) return;
      logger.debug(`Staff !unqueue request from nick ${event.nick}`);
      if (!matches[1]) return event.reply('Please provide a valid position number to unqueue');
      const pos = parseInt(matches[1]);
      if (!pos || pos < 0) return event.reply('Please provide a valid position number to unqueue');
      try {
        const user = await QueueManager.unqueueUserByPosition(pos - 1);
        QueueManager.addUnqueuedUser(user.nick);
        return event.reply(`Removed ${user.nick} from the queue`);
      } catch (e) {
        return event.reply(e.message ? e.message : e.toString());
      }
    });
  }
}
