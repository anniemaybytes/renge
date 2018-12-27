#!/bin/bash

# Install Elixir
wget https://packages.erlang-solutions.com/erlang-solutions_1.0_all.deb && sudo dpkg -i erlang-solutions_1.0_all.deb
sudo apt-get update
sudo apt-get install esl-erlang
sudo apt-get install elixir
rm erlang-solutions_1.0_all.deb

# Setup config
mkdir logs
head -n -1 config/config.exs > config/config.secret.exs
echo "Please modify config/config.secret.exs accordingly before proceeding!"
