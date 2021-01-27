import { readFileSync } from 'fs';
import { getLogger } from '../logger';
import { ConfigFile } from '../types';
const logger = getLogger('Config');

const configFilePath = 'config.json';

export class Config {
  public static configCache?: ConfigFile = undefined;

  public static getConfig() {
    if (!Config.configCache) Config.reloadConfig();
    return Config.configCache as ConfigFile;
  }

  public static reloadConfig() {
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
