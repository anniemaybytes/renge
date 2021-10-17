import { SinonSandbox, createSandbox } from 'sinon';
import { expect } from 'chai';
import { Config } from './config';
import mock from 'mock-fs';

describe('Config', () => {
  let sandbox: SinonSandbox;

  beforeEach(() => {
    Config.configCache = undefined;
    mock({ 'config.json': '{"some":"data"}' });
    sandbox = createSandbox();
  });

  afterEach(() => {
    mock.restore();
    sandbox.restore();
  });

  describe('getConfig', () => {
    it('Gets config from config.json', () => {
      expect(Config.getConfig()).to.deep.equal({ some: 'data' });
    });

    it('Uses cached config and only reads from disk once', () => {
      expect(Config.getConfig()).to.deep.equal({ some: 'data' });
      mock({ 'config.json': '{"new":"data"}' });
      expect(Config.getConfig()).to.deep.equal({ some: 'data' });
    });
  });

  describe('reloadConfig', () => {
    it('Will reload/cache new data from disk for getConfig', () => {
      mock({ 'config.json': '{"new":"data"}' });
      Config.reloadConfig();
      expect(Config.getConfig()).to.deep.equal({ new: 'data' });
    });

    it('Will use empty defaults if config file cannot be found', () => {
      mock({});
      Config.reloadConfig();
      expect(Config.getConfig()).to.deep.equal({});
    });
  });
});
