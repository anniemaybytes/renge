import got from 'got';
import { Config } from './config';
import { getLogger } from '../logger';
import type { ReEnableResponse } from '../types';
const logger = getLogger('AnimeBytesClient');

export class ABClient {
  public static REQUEST_TIMEOUT_MS = 1000 * 30; // 30 seconds
  public static got = got.extend({
    headers: { 'User-Agent': 'renge/2.0 (got [ABClient])' },
    followRedirect: false,
    throwHttpErrors: false,
    timeout: ABClient.REQUEST_TIMEOUT_MS,
  });
  public static url = 'https://animebytes.tv';
  public static siteApiKey = Config.getConfig().site_api_key || '';

  public static async staffReEnableUser(username: string, staffUser: string, reason?: string) {
    return (await ABClient.makeRequest(`/api/reenable/${username}/staff`, {
      enabler: staffUser,
      reason,
    })) as ReEnableResponse;
  }

  public static async anonymousReEnableUser(username: string) {
    return (await ABClient.makeRequest(`/api/reenable/${username}/user`, {})) as ReEnableResponse;
  }

  public static async createPaste(name: string, paste: string, passphrase: string) {
    const response = await ABClient.makeRequest('/api/pastes/create', { name, passphrase, body: paste });
    if (!response.success) throw new Error(`Error creating paste: ${response.error}`);
    return `${ABClient.url}/pastes/${response.path}?passphrase=${passphrase}`;
  }

  // Not meant to be called directly from outside the client. Public for testing purposes
  public static async makeRequest(path: string, body: any, authenticated = true) {
    const url = `${ABClient.url}${path}`;
    logger.trace(`AnimeBytes POST ${url} -> ${JSON.stringify(body)}`);
    const res = await ABClient.got(url, {
      method: 'POST',
      json: body,
      responseType: 'text',
      searchParams: authenticated ? { authKey: ABClient.siteApiKey } : undefined,
    });
    logger.trace(`AnimeBytes POST ${url} <- [${res.statusCode}] ${res.body}`);
    if (Math.floor(res.statusCode / 100) !== 2) throw new Error(`Received HTTP ${res.statusCode} from AB call to ${path}`);
    try {
      return JSON.parse(res.body);
    } catch {
      return res.body;
    }
  }
}
