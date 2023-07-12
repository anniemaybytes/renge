import { IRCClient } from '../clients/irc.js';
import { QueueManager } from '../manager/queue.js';
import { Utils } from '../utils.js';

import { Logger } from '../logger.js';
const logger = Logger.get('QueueCommand');

export class QueueCommand {
  private static regex = /^!queue(?:\s+(\S.*))?/i;

  public static register() {
    IRCClient.addMessageHookInChannel(IRCClient.userSupportChan, QueueCommand.regex, async (event) => {
      const matches = event.message.match(QueueCommand.regex);
      if (!matches || (await IRCClient.isStaff(event.nick)) || (await IRCClient.isChannelOp(IRCClient.userSupportChan, event.nick))) return;
      logger.debug(`User !queue request from nick ${event.nick}`);
      if (!matches[1])
        return event.reply(
          'If you need your account re-enabled please type !reenable <your username>. Otherwise please enter the support queue with !queue <reason you need assistance>.',
        );
      if (matches[1].length > 140)
        return event.reply('Sorry, your reason is a bit too long. Mind cutting it down to 140 characters and trying again?');
      try {
        if (await QueueManager.queueUser(event.nick, matches[1].trim())) {
          return event.reply("You've been added to the queue!");
        }
        return event.reply("You're already in the queue! If you'd like to leave just type !unqueue or part the channel.");
      } catch (e) {
        logger.error(`Error queuing ${event.nick}: ${e}`);
        return event.reply('An error has occured, please try again later');
      }
    });

    IRCClient.addMessageHookInChannel(IRCClient.staffSupportChan, QueueCommand.regex, async (event) => {
      logger.debug(`Staff !queue request from nick ${event.nick}`);
      if (QueueManager.queue.length === 0) return event.reply('No users are queued!');
      let queueText = '';
      const now = new Date().getTime();
      QueueManager.queue.forEach((user, i) => {
        const timeDiffMinutes = Math.floor((now - user.time.getTime()) / 1000 / 60);
        const timeDiffString = timeDiffMinutes ? `${Utils.minutesToString(timeDiffMinutes)} ago` : 'just now';
        queueText += `${i + 1}. ${user.nick} - ${user.reason ? `${user.reason} - ` : ''}${timeDiffString}\n`;
      });
      queueText.trimEnd().split('\n').forEach(event.reply);
    });
  }
}
