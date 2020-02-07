defmodule SupportBot.SupportSessionSup do
  use DynamicSupervisor

  def start_link(opts \\ []) do
    DynamicSupervisor.start_link(__MODULE__, :ok, opts)
  end

  def start_child({chan, user, handler, reason}, opts \\ []) do
    spec = %{
      id: SupportBot.SupportSession,
      start: {SupportBot.SupportSession, :start_link, [{chan, user, handler, reason}, opts]},
      restart: :temporary,
    }
    DynamicSupervisor.start_child(__MODULE__, spec)
  end

  def init(:ok) do
    DynamicSupervisor.init(strategy: :one_for_one)
  end
end
