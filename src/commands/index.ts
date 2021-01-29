import { listenForUserQueue, listenForStaffQueue } from './queue';
import { listenForUserUnqueue, listenForStaffUnqueue } from './unqueue';
import { listenForUserReenable, listenForStaffReenable } from './reenable';
import { listenForStaffHandle } from './handle';
import { listenForStaffSessions } from './sessions';
import { listenForStaffKill } from './kill';
import { listenForStaffIP } from './ip';
import { listenForStaffLogs } from './logs';

export function addCommands() {
  // user
  listenForUserQueue();
  listenForUserUnqueue();
  listenForUserReenable();
  // staff
  listenForStaffQueue();
  listenForStaffUnqueue();
  listenForStaffReenable();
  listenForStaffHandle();
  listenForStaffSessions();
  listenForStaffKill();
  listenForStaffIP();
  listenForStaffLogs();
}
