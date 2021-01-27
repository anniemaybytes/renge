import { listenForUserQueue, listenForStaffQueue } from './queue';
import { listenForUserUnqueue, listenForStaffUnqueue } from './unqueue';
import { listenForUserReenable, listenForStaffReenable } from './reenable';
import { listenForStaffHandle } from './handle';
import { listenForStaffSessions } from './sessions';

export function addCommands() {
  listenForUserQueue();
  listenForStaffQueue();
  listenForUserUnqueue();
  listenForStaffUnqueue();
  listenForUserReenable();
  listenForStaffReenable();
  listenForStaffHandle();
  listenForStaffSessions();
}
