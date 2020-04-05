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
```sh
wget https://packages.erlang-solutions.com/erlang-solutions_2.0_all.deb && dpkg -i erlang-solutions_2.0_all.deb
apt-get update
apt-get install esl-erlang
apt-get install elixir
```

Running is very simple. It is recommended to update dependencies and re-compile on every run. Manual steps:
```sh
mix deps.get
mix compile
mix run --no-halt
```

Example systemd unit file:
```systemd
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

Alternatively, you can also build/use a docker container instead:

```sh
docker build . -t supportbot
docker run -d --restart=always --user 1001:1001 -v ${PWD}/config.secret.exs:/app/config/config.secret.exs \
-v ${PWD}/logs:/app/logs -e ERL_COOKIE=foo supportbot
```

## Configuration

The file should be named `config.secret.exs` and is extension of `Mix.Config`. It can overwrite any values set by default at `config.exs`. For quick start you can just copy `config.exs` file, remove last `import_config` line and adapt it as necessary.