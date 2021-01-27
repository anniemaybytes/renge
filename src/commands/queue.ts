import { IRCClient } from '../clients/irc';
import { SupportQueue } from '../handlers/supportQueue';
import { minutesToString } from '../utils';
import { getLogger } from '../logger';
const logger = getLogger('QueueCommand');

const queueMatchRegex = /^!queue(?:\s*(.*))?/i;

export function listenForUserQueue() {
  IRCClient.addMessageHookInChannel(IRCClient.userSupportChan, queueMatchRegex, async (event) => {
    const matches = event.message.match(queueMatchRegex);
    if (!matches || (await IRCClient.isStaff(event.nick)) || (await IRCClient.isChannelOp(IRCClient.userSupportChan, event.nick))) return;
    logger.debug(`User queue request from nick ${event.nick}`);
    if (!matches[1])
      return event.reply(
        'If you need your account re-enabled please type !reenable <your username>. Otherwise please enter the support queue with !queue <reason you need assistance>.'
      );
    if (matches[1].length > 140) return event.reply('Sorry, your reason is a bit too long. Mind cutting it down to 140 characters and trying again?');
    try {
      if (await SupportQueue.queueUser(event.nick, matches[1])) {
        return event.reply("You've been added to the queue!");
      }
      return event.reply("You're already in the queue! If you'd like to leave just type !unqueue or part the channel.");
    } catch (e) {
      logger.error(`Error queuing ${event.nick}: ${e}`);
      return event.reply('Internal Error');
    }
  });
}

export function listenForStaffQueue() {
  IRCClient.addMessageHookInChannel(IRCClient.staffSupportChan, queueMatchRegex, async (event) => {
    if (SupportQueue.queue.length === 0) return event.reply('No users are queued!');
    let queueText = '';
    const now = new Date().getTime();
    SupportQueue.queue.forEach((user, i) => {
      const timeDiffMinutes = Math.floor((now - user.time.getTime()) / 1000 / 60);
      const timeDiffString = timeDiffMinutes ? `${minutesToString(timeDiffMinutes)} ago` : 'just now';
      queueText += `${i + 1}. ${user.nick} - ${user.reason ? `${user.reason} - ` : ''}${timeDiffString}\n`;
    });
    queueText.trimEnd().split('\n').forEach(event.reply);
  });
}
