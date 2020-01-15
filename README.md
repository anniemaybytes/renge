# SupportBot

## Staff Usage
* `!queue` - view all queued users
* `!handle` - begin a support session with the next user in the queue
* `!handle [0-9]+` - begin a support session with the user in the specified queue position
* `!handle [nick]` - begin a support session with the user in the queue with the specified nick
* `!end` - end a support session.
* `!reenable <user> [reason]` - reenables user with optionally specified reason

## User Usage
* `!reenable <user>` - attempt automatic account reenable after inactivity prune
* `!queue [reason]` - enter the support queue with the specific reason
