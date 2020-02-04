defmodule SupportBot.Queue do
  use GenServer

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, :ok, opts)
  end
  
  def init(:ok) do
    {:ok, []}
  end

  def handle_call(:view, _from, state) do
    {:reply, state, state}
  end

  def handle_call({:enqueue, {nick, message}}, _from, state) do
    case check_in_queue(nick, state) do
      nil ->
        ip = SupportBot.Util.get378(nick) |> String.split(" ") |> List.last
        Kaguya.Util.sendPM("User #{nick} requires support: #{message}", Application.get_env(:support_bot, :queue_announce_chan))
        {:reply, :ok, [{nick, message, Timex.now(), ip}|state]}
      _ -> {:reply, :dupe, state}
    end
  end

  def handle_call({:rename, {old_nick, new_nick}}, _from, state) do
    new_state =
      Enum.map(state, fn {nick, reason, time, ip} ->
        if nick == old_nick do
          {new_nick, reason, time, ip}
        else
          {nick, reason, time, ip}
        end
      end)
    {:reply, :ok, new_state}
  end

  def handle_call(:length, _from, state) do
    {:reply, length(state), state}
  end
  
  def handle_call(_, _from, state) when length(state) == 0 do
    {:reply, nil, state}
  end

  def handle_call(:peek, _from, state) do
    {:reply, Enum.at(state, -1), state}
  end

  def handle_call(:dequeue, _from, state) do
    {new_state, [user]} = Enum.split(state, -1)
    {:reply, user, new_state}
  end

  def handle_call({:dequeue_ith, i}, _from, state) do
    idx = length(state) - 1 - i
    case {i > length(state), Enum.at(state, idx)} do
      {v, e} when v or e == nil -> {:reply, nil, state}
      {_, user} ->
        {nick, _reason, _time, _ip} = user
        {new_state, _user} = Enum.split_with(state, fn {n, _m, _t, _i} -> n != nick end)
        {:reply, user, new_state}
    end
  end

  def handle_call({:dequeue_nick, nick}, _from, state) do
    case check_in_queue(nick, state) do
      nil ->
        {:reply, nil, state}
      _ ->
        {new_state, [user]} = Enum.split_with(state, fn {n, _m, _t, _i} -> String.downcase(n) != String.downcase(nick) end)
        {:reply, user, new_state}
    end
  end

  def handle_call({:dequeue_nick_data, nick}, _from, state) do
    case check_in_queue(nick, state) do
      nil ->
        {:reply, nil, state}
      _ ->
        {new_state, [user]} = Enum.split_with(state, fn {n, _m, _t, _i} -> String.downcase(n) != String.downcase(nick) end)
        {:reply, user, new_state}
    end
  end

  def check_in_queue(nick, queue) do
    Enum.find(queue, fn {n, _m, _t, _i} ->
      String.downcase(n) == String.downcase(nick)
    end)
  end
end
