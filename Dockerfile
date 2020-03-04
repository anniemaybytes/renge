FROM elixir:1.10.1-alpine

WORKDIR /app

RUN mkdir -p /.mix && ln -s /.mix /root/.mix

COPY mix.exs .
COPY mix.lock .

RUN mix do local.hex --force, local.rebar --force && \
    mix do deps.get, deps.compile

COPY . .

RUN mix compile && chmod -R 777 /.mix && \
    chmod -R 777 /app

USER 1000:1000

CMD [ "mix", "run", "--no-halt" ]
