import 'source-map-support/register';
import { LevelDB } from './clients/leveldb';
import { IRCClient } from './clients/irc';
import { SupportQueue } from './handlers/supportQueue';
import { SupportSessionManager } from './handlers/supportSessionManager';
import { addCommands } from './commands';
import { sleep } from './utils';
import { getLogger } from './logger';
const logger = getLogger('main');

async function main() {
  logger.info('Starting renge');
  await LevelDB.initialize();
  await SupportQueue.initQueue();
  addCommands();
  IRCClient.connect();
  await IRCClient.waitUntilJoined();
  await SupportSessionManager.initSessionManager();
}

let stopSignalReceived = false;
async function shutdown() {
  // If spamming a stop signal, exit without caring about properly shutting down everything
  if (stopSignalReceived) process.exit(1);
  stopSignalReceived = true;
  logger.error('Signal to stop received, shutting down');
  IRCClient.shutDown();
  // give irc client time to shut down and call callbacks
  await sleep(3000);
  await LevelDB.shutdown();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((e) => logger.error('Unexpected fatal error:', e));
