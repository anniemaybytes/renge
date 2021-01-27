import { createSandbox, SinonSandbox, SinonStub, assert } from 'sinon';
import { addCommands } from '.';
import { IRCClient } from '../clients/irc';

describe('Commands', () => {
  let sandbox: SinonSandbox;
  let hookStub: SinonStub;

  beforeEach(() => {
    sandbox = createSandbox();
    hookStub = sandbox.stub(IRCClient, 'addMessageHookInChannel');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('addCommands', () => {
    it('Adds message hooks to the IRC bot', () => {
      addCommands();
      assert.called(hookStub);
    });
  });
});
