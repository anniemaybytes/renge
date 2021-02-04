import { IRCClient } from '../clients/irc';
import { QueueManager } from '../handlers/queueManager';
import { SessionManager } from '../handlers/sessionManager';
import { getLogger } from '../logger';
const logger = getLogger('HandleCommand');

const handleMatchRegex = /^!handle(?:\s*([a-zA-Z0-9_-]+))?(?:\s*(.+))?/i;

export function listenForStaffHandle() {
  IRCClient.addMessageHookInChannel(IRCClient.staffSupportChan, handleMatchRegex, async (event) => {
    const matches = event.message.match(handleMatchRegex);
    if (!matches) return;
    logger.debug(`Staff !handle request from nick ${event.nick}`);
    if (matches[1] && matches[2]) {
      // 'manual' handle request with nick and reason
      try {
        await SessionManager.startSupportSession(matches[1], event.nick, false, matches[2], 'N/A');
        // Remove user from queue if they were in the queue, ignoring errors
        QueueManager.unqueueUser(undefined, matches[1]).catch(() => '');
      } catch (e) {
        return event.reply(e.message ? e.message : e.toString());
      }
    }
    const pos = matches[1] ? parseInt(matches[1]) : 1; // if a position or nick wasn't specified, default to position 1
    if (!pos || pos < 1) return event.reply('Please provide a valid position number to handle');
    try {
      const user = await QueueManager.unqueueUser(pos - 1);
      return await SessionManager.startSupportSession(user.nick, event.nick, true, user.reason, user.ip);
    } catch (e) {
      return event.reply(e.message ? e.message : e.toString());
    }
  });
}
