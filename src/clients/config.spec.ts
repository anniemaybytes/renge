import { SinonSandbox, createSandbox } from 'sinon';
import { expect } from 'chai';
import mock from 'mock-fs';

import { Config } from './config.js';

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

  describe('get', () => {
    it('Gets config from config.json', () => {
      expect(Config.get()).to.deep.equal({ some: 'data' });
    });

    it('Uses cached config and only reads from disk once', () => {
      expect(Config.get()).to.deep.equal({ some: 'data' });
      mock({ 'config.json': '{"new":"data"}' });
      expect(Config.get()).to.deep.equal({ some: 'data' });
    });
  });

  describe('reload', () => {
    it('Will reload/cache new data from disk for getConfig', () => {
      mock({ 'config.json': '{"new":"data"}' });
      Config.reload();
      expect(Config.get()).to.deep.equal({ new: 'data' });
    });

    it('Will use empty defaults if config file cannot be found', () => {
      mock({});
      Config.reload();
      expect(Config.get()).to.deep.equal({});
    });
  });
});
