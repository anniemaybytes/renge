use Mix.Config

config :logger, level: :info

config :kaguya,
  server: "ircd",
  port: 6667

config :support_bot,
  oper_name: "oper",
  oper_pass: "s3cret"
