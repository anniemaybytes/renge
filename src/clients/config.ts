import { readFileSync } from 'fs';

import { ConfigFile } from '../types.js';

import { Logger } from '../logger.js';
const logger = Logger.get('Config');

const configFilePath = 'config.json';

export class Config {
  public static configCache?: ConfigFile = undefined;

  public static get() {
    if (!Config.configCache) Config.reload();
    return Config.configCache as ConfigFile;
  }

  public static reload() {
    // Using readFileSync intentionally here to make this a synchronous function
    let configFile = '{}';
    try {
      configFile = readFileSync(configFilePath, 'utf8');
    } catch (e) {
      logger.error(`Error reading config file. Proceeding with empty defaults. ${e}`);
    }
    Config.configCache = JSON.parse(configFile);
  }
}
