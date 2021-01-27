import { IRCClient } from '../clients/irc';
import { ABClient } from '../clients/animebytes';
import { SupportQueue } from '../handlers/supportQueue';
import { minutesToString } from '../utils';
import { getLogger } from '../logger';
const logger = getLogger('ReenableCommand');

const reenableMatchRegex = /^!reenable(?:\s*([a-zA-Z0-9_-]+))(?:\s*(.+))?/i;

function userReenableMessage(username: string) {
  const now = new Date();
  const midnightUTC = new Date(now);
  midnightUTC.setUTCDate(midnightUTC.getUTCDate() + 1);
  midnightUTC.setUTCHours(0);
  midnightUTC.setUTCMinutes(0);
  midnightUTC.setUTCSeconds(0);
  midnightUTC.setUTCMilliseconds(0);
  const timeDiffMinutes = (midnightUTC.getTime() - now.getTime()) / 1000 / 60;
  return `User reenabled! Welcome back ${username}, please login by 00:00 UTC (within ${minutesToString(
    timeDiffMinutes
  )} from now) in order to prevent being disabled again. To prevent inactivity pruning from here on, you are required to visit the site within a ten week period per cycle. Reenables are a very limited service and repeat prunes will lead to permanent account closure. Please re-read the rules again: https://animebytes.tv/rules`; // eslint-disable-line max-len
}

export function listenForUserReenable() {
  IRCClient.addMessageHookInChannel(IRCClient.userSupportChan, reenableMatchRegex, async (event) => {
    const matches = event.message.match(reenableMatchRegex);
    if (!matches) return;
    logger.debug(`User reenable request for ${matches[1]} from nick ${event.nick}`);
    try {
      const response = await ABClient.anonymousReEnableUser(matches[1]);
      if (response.success) return event.reply(userReenableMessage(matches[1]));
      if (response.queue) {
        await SupportQueue.queueUser(event.nick, `User ${matches[1]} (https://animebytes.tv/user/profile/${matches[1]}) needs staff reenabling`);
        return event.reply("Your account could not be automatically reenabled! You've been added to the support queue, please wait for assistance.");
      }
      return event.reply(response.error || `Unknown error reenabling ${matches[1]}`);
    } catch (e) {
      logger.error(`Error calling user reenable on AB: ${e}`);
      return event.reply('Your account could not be reenabled for technical reasons. Please try again.');
    }
  });
}

export function listenForStaffReenable() {
  listenForStaffReenableInChannel(IRCClient.staffSupportChan);
}

// Returns function which should be called to remove the registered callback
export function listenForStaffReenableInChannel(channel: string) {
  const isSupportChannel = IRCClient.supportSessionChannels.includes(channel);
  return IRCClient.addMessageHookInChannel(channel, reenableMatchRegex, async (event) => {
    const matches = event.message.match(reenableMatchRegex);
    if (!matches) return;
    if (!(await IRCClient.isStaff(event.nick))) return;
    logger.debug(`Staff reenable request for ${matches[1]} from nick ${event.nick}`);
    try {
      const response = await ABClient.staffReEnableUser(matches[1], event.hostname.split('.')[0], matches[2] || undefined);
      if (response.success) {
        if (isSupportChannel) return event.reply(userReenableMessage(matches[1]));
        return event.reply('User reenabled!');
      }
      return event.reply(response.error || `Unknown error reenabling ${matches[1]}`);
    } catch (e) {
      logger.error(`Error calling staff reenable on AB: ${e}`);
      return event.reply('Account could not be reenabled for technical reasons. Please try again.');
    }
  });
}
