defmodule SupportBot do
  use Application

  def start(_type, _args) do
    require Logger
    Logger.log(:debug, "Starting SupportBot")

    children = [
      %{
        id: SupportBot.SupportSessionSup,
        start: {SupportBot.SupportSessionSup, :start_link, [[name: SupportBot.SupportSessionSup]]},
        type: :supervisor
      },
      %{
        id: SupportBot.Queue,
        start: {SupportBot.Queue, :start_link, [[name: SupportBot.Queue]]},
        type: :worker
      }
    ]

    {:ok, _pid} = Supervisor.start_link(children, strategy: :one_for_one)
  end
end
