import { expect } from 'chai';
import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { ABClient } from './animebytes';

describe('ABClient', () => {
  let sandbox: SinonSandbox;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('staffReEnableUser', () => {
    let makeRequestStub: SinonStub;
    beforeEach(() => {
      sandbox.stub(ABClient, 'makeRequest').resolves({ success: true });
      makeRequestStub = ABClient.makeRequest as SinonStub;
    });

    it('should call makeRequest with the correct path', async () => {
      await ABClient.staffReEnableUser('name', 'staff');
      assert.calledOnce(makeRequestStub);
      expect(makeRequestStub.getCall(0).args[0]).to.equal('/api/reenable/name/staff');
    });

    it('should call makeRequest with the correct body', async () => {
      await ABClient.staffReEnableUser('name', 'staff', 'reason');
      assert.calledOnce(makeRequestStub);
      expect(makeRequestStub.getCall(0).args[1]).to.deep.equal({ enabler: 'staff', reason: 'reason' });
    });

    it('should not throw if successful', async () => {
      makeRequestStub.resolves({ success: true });
      await ABClient.staffReEnableUser('name', 'staff');
    });
  });

  describe('anonymousReEnableUser', () => {
    let makeRequestStub: SinonStub;
    beforeEach(() => {
      sandbox.stub(ABClient, 'makeRequest');
      makeRequestStub = ABClient.makeRequest as SinonStub;
    });

    it('should call makeRequest with the correct path', async () => {
      await ABClient.anonymousReEnableUser('name');
      assert.calledOnce(makeRequestStub);
      expect(makeRequestStub.getCall(0).args[0]).to.equal('/api/reenable/name/user');
    });

    it('should call makeRequest with an empty body', async () => {
      await ABClient.anonymousReEnableUser('name');
      assert.calledOnce(makeRequestStub);
      expect(makeRequestStub.getCall(0).args[1]).to.deep.equal({});
    });

    it('should return the json from the http call response body', async () => {
      makeRequestStub.resolves({ cool: 'data' });
      expect(await ABClient.anonymousReEnableUser('name')).to.deep.equal({ cool: 'data' });
    });
  });

  describe('createPaste', () => {
    let makeRequestStub: SinonStub;
    beforeEach(() => {
      sandbox.stub(ABClient, 'makeRequest').resolves({ success: true });
      makeRequestStub = ABClient.makeRequest as SinonStub;
    });

    it('should call makeRequest with the correct path', async () => {
      await ABClient.createPaste('name', 'contents', 'pass');
      assert.calledOnce(makeRequestStub);
      expect(makeRequestStub.getCall(0).args[0]).to.equal('/api/pastes/create');
    });

    it('should call makeRequest with the correct body', async () => {
      await ABClient.createPaste('name', 'contents', 'pass');
      assert.calledOnce(makeRequestStub);
      expect(makeRequestStub.getCall(0).args[1]).to.deep.equal({ name: 'name', body: 'contents', passphrase: 'pass' });
    });

    it('should throw an error if success is false', async () => {
      makeRequestStub.resolves({ success: false });
      try {
        await ABClient.createPaste('name', 'contents', 'pass');
      } catch (e) {
        return;
      }
      return expect.fail('did not throw');
    });

    it('should return the paste path if successful', async () => {
      makeRequestStub.resolves({ success: true, path: 'pasteID' });
      expect(await ABClient.createPaste('name', 'contents', 'pass')).to.equal('https://animebytes.tv/pastes/pasteID?passphrase=pass');
    });
  });

  describe('makeRequest', () => {
    let gotStub: SinonStub;
    beforeEach(() => {
      sandbox.stub(ABClient, 'got').resolves({
        statusCode: 200,
        body: '{"stubbed":"data"}',
      } as any);
      gotStub = (ABClient.got as unknown) as SinonStub;
    });

    it('creates and calls fetch with correct url combining host and path', async () => {
      await ABClient.makeRequest('/myPath', {});
      assert.calledOnce(gotStub);
      expect(gotStub.getCall(0).args[0]).to.equal(`${ABClient.url}/myPath`);
    });

    it('adds authKey to query string when authenticated is true', async () => {
      const myBody: any = { testing: 'true' };
      await ABClient.makeRequest('/myPath', myBody);
      assert.calledOnce(gotStub);
      expect(gotStub.getCall(0).args[1].searchParams.authKey).to.equal(ABClient.siteApiKey);
    });

    it('does not add authKey to body when authenticated is false', async () => {
      const myBody: any = { testing: 'true' };
      await ABClient.makeRequest('/myPath', myBody, false);
      assert.calledOnce(gotStub);
      expect(gotStub.getCall(0).args[1].json.authKey).to.be.undefined;
    });

    it('calls fetch with the correct options', async () => {
      await ABClient.makeRequest('/myPath', {});
      assert.calledOnce(gotStub);
      expect(gotStub.getCall(0).args[1].method).to.equal('POST');
      expect(gotStub.getCall(0).args[1].json).to.not.be.undefined;
    });

    it('throws an exception if resulting status is not ok', async () => {
      gotStub.resolves({
        statusCode: 500,
        body: '{"stubbed":"data"}',
      });
      try {
        await ABClient.makeRequest('/myPath', {});
      } catch (e) {
        return;
      }
      expect.fail('Did not throw');
    });

    it('returns parsed json if the return body was JSON', async () => {
      expect(await ABClient.makeRequest('/myPath', {})).to.deep.equal({
        stubbed: 'data',
      });
    });

    it('returns the raw body string if the return body was not JSON', async () => {
      gotStub.resolves({
        statusCode: 200,
        body: 'stubbed',
      });
      expect(await ABClient.makeRequest('/myPath', {})).to.equal('stubbed');
    });
  });
});
