defmodule SupportBot do
  use Application

  def start(_type, _args) do
    import Supervisor.Spec
    require Logger
    Logger.log(:debug, "Starting SupportBot")

    children = [
      supervisor(SupportBot.SupportSessionSup, [[name: SupportBot.SupportSessionSup]]),
      worker(SupportBot.Queue, [[name: SupportBot.Queue]])
    ]

    {:ok, _pid} = Supervisor.start_link(children, strategy: :one_for_one)
  end
end
