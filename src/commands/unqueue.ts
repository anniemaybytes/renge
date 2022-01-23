import { IRCClient } from '../clients/irc';
import { QueueManager } from '../handlers/queueManager';
import { getLogger } from '../logger';
const logger = getLogger('UnqueueCommand');

const unqueueMatchRegex = /^!unqueue(?:\s+(\S+))?$/i;

export function listenForUserUnqueue() {
  IRCClient.addMessageHookInChannel(IRCClient.userSupportChan, unqueueMatchRegex, async (event) => {
    logger.debug(`User !unqueue request from nick ${event.nick}`);
    try {
      await QueueManager.unqueueUser(undefined, event.nick);
      QueueManager.addUnqueuedUser(event.nick);
      return event.reply("You've been removed from the queue!");
    } catch (e) {
      return event.reply("You're not in the queue!");
    }
  });
}

export function listenForStaffUnqueue() {
  IRCClient.addMessageHookInChannel(IRCClient.staffSupportChan, unqueueMatchRegex, async (event) => {
    const matches = event.message.match(unqueueMatchRegex);
    if (!matches) return;
    logger.debug(`Staff !unqueue request from nick ${event.nick}`);
    if (!matches[1]) return event.reply('Please provide a valid position number to unqueue');
    const pos = parseInt(matches[1]);
    if (!pos || pos < 0) return event.reply('Please provide a valid position number to unqueue');
    try {
      const user = await QueueManager.unqueueUser(pos - 1);
      QueueManager.addUnqueuedUser(user.nick);
      return event.reply(`Removed ${user.nick} from the queue`);
    } catch (e) {
      return event.reply(e.message ? e.message : e.toString());
    }
  });
}
