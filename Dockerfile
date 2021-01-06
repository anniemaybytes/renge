FROM elixir:1.11.3-alpine AS builder

WORKDIR /app

ENV MIX_ENV prod

RUN mix do local.hex --force, local.rebar --force

COPY mix.* ./
    
RUN mix do deps.get, deps.compile

COPY . .

RUN mix compile

RUN export APP_VSN="$(grep 'version:' mix.exs | cut -d '"' -f2)" && \
    mix distillery.release --warnings-as-errors --verbose && \
    mkdir -p /build && \
    cp _build/${MIX_ENV}/rel/support_bot/releases/${APP_VSN}/support_bot.tar.gz /build && \
    cd /build && \
    tar -xzf support_bot.tar.gz

FROM alpine:latest

WORKDIR /app

RUN apk add --no-cache bash openssl-dev ca-certificates

ENV REPLACE_OS_VARS=true \
    RELEASE_MUTABLE_DIR=/tmp

COPY --from=builder /build /app

USER 1000:1000

CMD [ "/app/bin/support_bot", "foreground" ]
