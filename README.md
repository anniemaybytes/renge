# renge

renge is our IRC support bot for AnimeBytes.

## Usage

It supports the following commands for users in support channel:

- `!reenable <user>` - attempt to automatically reenable an existing disabled user
- `!queue <reason>` - join a support queue which staff will handle
- `!unqueue` - leave the queue after you've joined it

It supports the following commands for staff:

- In staff channel:
  - `!queue` - view the current state of the queue
  - `!unqueue <position>` - remove someone from the queue based on their position in the queue
  - `!handle [position]` - start a new support session with someone from the queue by position;
    if none given, then first in the queue
  - `!handle <nick> <reason>` - start a support session with someone who is not in the queue
  - `!sessions` - view the currently active support sessions
  - `!kill <channel>` - end a current support session by channel name
  - `!reenable <user> [reason]` - reenable an existing disabled user with staff permissions
  - `!ip <nick>` - send the IP of a nick to the staff requester in a NOTICE. Nick must be in the queue or an active session
  - `!logs` - view the up to the last 10 completed support sessions and their log pastes
- In active support session
  - `!reenable <user>` - reenable an existing disabled user with staff permissions

## Installation

renge requires NodeJS version 16.13 or later and [Yarn package manager](https://classic.yarnpkg.com/).

```sh
yarn --frozen-lockfile && yarn build
node dist/index.js
```

Example systemd unit file:

```systemd
[Unit]
Description=renge
After=network.target

[Service]
Environment="LOG_LEVEL=info"
WorkingDirectory=/opt/renge
ExecStart=/usr/bin/node dist/index.js
RestartSec=10s
Restart=always
User=renge

[Install]
WantedBy=default.target
```

Alternatively, you can also build/use a docker container instead:

```sh
docker build . -t renge
docker run -d --restart=always -v ${PWD}/config.json:/app/config.json -v ${PWD}/logs:/app/logs -v ${PWD}/state.ldb:/app/state.ldb renge
```

## Configuration

Configuration is done via `config.json` file which should be in the working directory of the application with the following format:

```json
{
  "state_db": "state.ldb",
  "logs_dir": "logs",

  "irc_server": "irc.example.com",
  "irc_port": 6697,
  "irc_use_ssl": true,
  "irc_verify_ssl": true,
  "irc_nick": "Renge",
  "irc_realname": "Renge Miyauchi",
  "irc_username": "Renge",
  "oper_username": "",
  "oper_pass": "",

  "site_api_key": "",

  "staff_channel": "#support-staff",
  "user_channel": "#support",
  "log_channel": "#support-logging",
  "session_channels": ["#support-session1", "#support-session2", "#support-session3"],

  "staff_hostmasks": ["*!*@*.Staff.Example"]
}
```

- `state_db` - full path where LevelDB database with persistent state such as the queue and active sessions are stored
- `logs_dir` - directory to store text logs of sessions after they are completed
- `irc_server` - address of IRC server to connect to
- `irc_port` - port of the IRC server
- `irc_use_ssl` - whether to use SSL or not when connecting to IRC server
- `irc_verify_ssl` - whether to verify the IRC server certificate
- `irc_nick` - IRC nick to use for the bot
- `irc_realname` - IRC realname to use for the bot
- `irc_username` - IRC username to use for the bot
- `oper_username` - username to use when authenticating as IRC operator
- `oper_pass` - password to use when authenticating as IRC operator
- `site_api_key` - api key to use with site (used when creating pastes or reenabling users)
- `staff_channel` - IRC channel to listen for staff commands and announce newly queued users
- `user_channel` - IRC channel to listen for user commands
- `log_channel` - IRC channel where active support sessions are logged
- `session_channels` - array of IRC channels where support sessions between a user and staff should be held
- `staff_hostmasks` - array of IRC-style hostmask for irc users which should be considered staff 
  ([ref](https://www.afternet.org/help/irc/hostmasks))

Additionally the bot expects `LOG_LEVEL` environment variable to be set to one of:

- `trace`
- `debug` (default if not provided)
- `info`
- `warn`
- `error`
