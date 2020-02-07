# SupportBot

## Usage

### Staff Usage
* `!queue` - view all queued users
* `!handle` - begin a support session with the next user in the queue
* `!handle [0-9]+` - begin a support session with the user in the specified queue position
* `!handle [nick]` - begin a support session with the user in the queue with the specified nick
* `!end` - end a support session.
* `!reenable <user> [reason]` - reenables user with optionally specified reason

### User Usage
* `!reenable <user>` - attempt automatic account reenable after inactivity prune
* `!queue [reason]` - enter the support queue with the specific reason

## Installation

First, you'll need to install Elixir:
```
# wget https://packages.erlang-solutions.com/erlang-solutions_2.0_all.deb && dpkg -i erlang-solutions_2.0_all.deb
# apt-get update
# apt-get install esl-erlang
# apt-get install elixir
```

Running is very simple. It is recommended to update dependencies and re-compile on every run. Manual steps:
```
$ mix deps.get
$ mix compile
$ mix run --no-halt
```

Example systemd unit file:
```
[Unit]
Description=SupportBot
After=network.target

[Service]
Environment="HOME=/opt/SupportBot"
WorkingDirectory=/opt/SupportBot
ExecStartPre=/usr/bin/mix deps.get
ExecStartPre=/usr/bin/mix compile
ExecStart=/usr/bin/mix run --no-halt
RestartSec=30s
Restart=always
User=SupportBot

[Install]
WantedBy=default.target
```

## Configuration

Copy example from `config/config.exs` to `config/config.secret.exs` and configure it as necessary.