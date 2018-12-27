#!/bin/bash
mix deps.get
mix compile
iex -S mix
