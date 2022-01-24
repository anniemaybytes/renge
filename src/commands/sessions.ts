import { IRCClient } from '../clients/irc.js';
import { SessionManager } from '../manager/session.js';
import { Utils } from '../utils.js';

import { Logger } from '../logger.js';
const logger = Logger.get('SessionsCommand');

export class SessionsCommand {
  private static regex = /^!sessions$/i;

  public static register() {
    IRCClient.addMessageHookInChannel(IRCClient.staffSupportChan, SessionsCommand.regex, async (event) => {
      logger.debug(`Staff !sessions request from nick ${event.nick}`);
      const activeSessions = Object.values(SessionManager.activeSupportSessions).filter((sess) => !sess.ended);
      if (!activeSessions.length) {
        event.reply('No active sessions');
      } else {
        activeSessions.forEach((sess) => {
          event.reply(
            `${Utils.getIRCColorFunc(sess.color)(sess.ircChannel)} - ${Utils.space(sess.staffHandlerNick)} helping ${
              sess.userClientNick
            } started ${Utils.dateToFriendlyString(new Date(sess.startTime))} reason: ${sess.reason}`
          );
        });
      }
    });
  }
}
