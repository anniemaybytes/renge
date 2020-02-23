use Mix.Config

config :kaguya,
  server: "your.irc.server",
  port: 6666,
  bot_name: "support_bot",
  help_cmd: "!help",
  channels: ["#staff-support", "#user-support", "#support-logging"]

config :support_bot,
  auth_key: "REPLACE_ME",
  oper_name: "NAME",
  oper_pass: "REPLACE_ME",
  user_reenable_api: "mysite.com/api/reenable",
  paste_create_url: "mysite.com/api/pastes/create",
  paste_fetch_url: "mysite.com/pastes",
  user_profile_location: "mysite.com/profile?id=",
  staff_support_chans: ["#staff-support"],
  queue_announce_chan: "#staff-support",
  user_support_chans: ["#user-support"],
  support_session_chans: ["#support-session1", "#support-session2"],
  staff_vhosts: ["*!*@*.SupportStaff.MySite"],
  log_chan: "#support-logging",
  log_path: "./logs",
  idle_alert_time: 300000,
  idle_kick_time: 900000

if File.exists?("config/config.secret.exs"), do: import_config "config.secret.exs"
