use Distillery.Releases.Config,
    default_release: :default,
    default_environment: Mix.env()

release :support_bot do
  set version: current_version(:support_bot)
  set applications: [
    :runtime_tools
  ]
end

environment :prod do
  set include_erts: true
  set include_src: false
  set vm_args: "rel/vm.args"
  set cookie: :"${ERL_COOKIE}"
  set config_providers: [
    {Distillery.Releases.Config.Providers.Elixir, ["${RELEASE_ROOT_DIR}/config/config.secret.exs"]}
  ]
end
