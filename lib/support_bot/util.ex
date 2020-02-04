defmodule SupportBot.Util do
  def sajoin(user, channel) do
    m = %Kaguya.Core.Message{command: "SAJOIN", args: [user, channel]}
    :ok = GenServer.call(Kaguya.Core, {:send, m})
  end

  def sapart(user, channel) do
    m = %Kaguya.Core.Message{command: "SAPART", args: [user, channel]}
    :ok = GenServer.call(Kaguya.Core, {:send, m})
  end

  def get378(nick) do
    match_fun =
      fn msg ->
        case msg.command do
          "378" -> {true, msg.trailing}
          _ -> false
        end
      end

    Task.async(fn ->
      :timer.sleep(100)
      m = %Kaguya.Core.Message{command: "WHOIS", args: [nick]}
      :ok = GenServer.call(Kaguya.Core, {:send, m})
    end)

    try do
      GenServer.call(Kaguya.Module.Core, {:add_callback, match_fun}, 3000)
    catch
      :exit, _ -> GenServer.cast(Kaguya.Module.Core, {:remove_callback, self()})
      nil
    end
  end

  def mode(target, mode, args \\ []) do
    m = %Kaguya.Core.Message{command: "MODE", args: [target, mode] ++ args}
    :ok = GenServer.call(Kaguya.Core, {:send, m})
  end

  def space_nick(nick) do
    nick
    |> String.split("", parts: 3)
    |> Enum.join("\u200B")
  end

  def random_str(n) when is_integer n do
    :crypto.strong_rand_bytes(n)
    |> :base64.encode_to_string
    |> to_string
  end

  def serialize_line({time, %{command: "JOIN"} = message}) do
    {:ok, time_str} = Timex.Format.DateTime.Formatter.format(time, "%H:%M:%S", :strftime)
    "[#{time_str}] #{message.user.nick} has joined the channel."
  end

  def serialize_line({time, %{command: "PART"} = message}) do
    {:ok, time_str} = Timex.Format.DateTime.Formatter.format(time, "%H:%M:%S", :strftime)
    "[#{time_str}] #{message.user.nick} has left the channel."
  end

  def serialize_line({time, %{command: "QUIT"} = message}) do
    {:ok, time_str} = Timex.Format.DateTime.Formatter.format(time, "%H:%M:%S", :strftime)
    "[#{time_str}] #{message.user.nick} has quit."
  end

  def serialize_line({time, %{command: "NICK"} = message}) do
    {:ok, time_str} = Timex.Format.DateTime.Formatter.format(time, "%H:%M:%S", :strftime)
    "[#{time_str}] #{message.user.nick} has changed nick to #{message.trailing}."
  end

  def serialize_line({time, message}) do
    {:ok, time_str} = Timex.Format.DateTime.Formatter.format(time, "%H:%M:%S", :strftime)
    "[#{time_str}] #{message.user.nick}: #{message.trailing}"
  end

  def serialize_log(log, user, handler, time, channel, reason) do
    lines =
      log
      |> Enum.map(&serialize_line/1)
      |> Enum.reverse
    {:ok, time_str} = Timex.Format.DateTime.Formatter.format(time, "%a, %b %d %Y %H:%M:%S UCT", :strftime)
    [
      "Log of support conversation between #{user} and #{handler} in #{channel}. Reason: #{reason}",
      "Conversation start date: #{time_str}"
    ] ++ lines
    |> Enum.join("\n")
  end

  def match_user(user, to_match) do
    pad = fn str -> "^#{str}$" end
    [nick, name, rdns] =
      String.split(to_match, ["!", "@"])
      |> Enum.map(fn pat ->
        pat
        |> String.split("*")
        |> Enum.map(&Regex.escape/1)
        |> Enum.join(".+")
        |> pad.()
        |> Regex.compile!
      end)
    Regex.match?(nick, user.nick) && Regex.match?(name, user.name) && Regex.match?(rdns, user.rdns)
  end
end
