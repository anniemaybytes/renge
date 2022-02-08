import 'source-map-support/register.js';

import { LevelDB } from './clients/leveldb.js';
import { IRCClient } from './clients/irc.js';
import { QueueManager } from './manager/queue.js';
import { SessionManager } from './manager/session.js';
import { Logger } from './logger.js';
import { IPCommand } from './commands/ip.js';
import { HandleCommand } from './commands/handle.js';
import { KillCommand } from './commands/kill.js';
import { LogsCommand } from './commands/logs.js';
import { QueueCommand } from './commands/queue.js';
import { ReenableCommand } from './commands/reenable.js';
import { SessionsCommand } from './commands/sessions.js';
import { UnqueueCommand } from './commands/unqueue.js';
import { Utils } from './utils.js';

const logger = Logger.get('main');

async function main() {
  logger.info('Starting renge');

  await LevelDB.initialize();
  await QueueManager.start();

  HandleCommand.register();
  IPCommand.register();
  KillCommand.register();
  LogsCommand.register();
  QueueCommand.register();
  await ReenableCommand.register();
  SessionsCommand.register();
  UnqueueCommand.register();

  IRCClient.connect();
  await IRCClient.waitUntilJoined();

  await SessionManager.start();
}

let stopSignalReceived = false;
async function shutDown() {
  // If spamming a stop signal, exit without caring about properly shutting down everything
  if (stopSignalReceived) process.exit(1);

  logger.error('Signal to stop received, shutting down');
  stopSignalReceived = true;

  ReenableCommand.shutDown();
  IRCClient.shutDown();
  // give irc client time to shut down and call callbacks
  await Utils.sleep(3000);

  await LevelDB.shutDown();

  process.exit(0);
}

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);

main().catch((e) => logger.error('Unexpected fatal error:', e));
