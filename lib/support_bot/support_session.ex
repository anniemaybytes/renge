defmodule SupportBot.SupportSession do
  import SupportBot.Util
  import Kaguya.Util
  use GenServer

  def start_link({channel, user, handler, reason}, opts \\ []) do
    start_time = Timex.Date.universal
    GenServer.start_link(__MODULE__, {channel, [], true, start_time, user, handler, reason}, opts)
  end

  def init({channel, log, store_log, start_time, user, handler, reason}) do
    sajoin(handler, channel)
    sajoin(user, channel)
    Kaguya.Util.sendPM(
      "Beginning support conversation between #{space_nick(user)} and #{space_nick(handler)} in #{channel}. Reason: #{reason}",
      Application.get_env(:support_bot, :log_chan)
    )
    Kaguya.Util.sendNotice(
      "#{user}, you are now being helped by #{handler} in #{channel}.",
      user
    )
    color = Enum.random([white(), blue(), green(), lightred(), red(), magenta(), brown(), yellow(), lightgreen(), cyan(), lightcyan(), lightblue(), lightmagenta(), gray()])
    {:ok, {channel, log, store_log, start_time, user, handler, color, reason}}
  end

  def handle_call(:handler, _from, s = {_channel, _log, _store_log, _start_time, _user, handler, _color, _reason}) do
    {:reply, handler, s}
  end

  def handle_cast({:log, message}, {channel, log, store_log, start_time, user, handler, color, reason}) do
    nick = space_nick(message.user.nick)

    chan_prefix = "#{color}#{channel}#{clear()}"
    log_chan_msg = case message.command do
      "PRIVMSG" -> "#{chan_prefix} - #{nick}: #{message.trailing}"
      "JOIN" -> "#{chan_prefix} - #{nick} has joined."
      "PART" -> "#{chan_prefix} - #{nick} has parted."
      "QUIT" -> "#{chan_prefix} - #{nick} has quit."
      "NICK" -> "#{chan_prefix} - #{nick} has changed their nick to #{message.trailing}."
      cmd -> "#{chan_prefix} - #{nick} sends #{cmd}"
    end

    Kaguya.Util.sendPM(
      log_chan_msg,
      Application.get_env(:support_bot, :log_chan)
    )

    time = Timex.Date.universal
    logged_message = {time, message}
    {:noreply, {channel, [logged_message|log], store_log, start_time, user, handler, color, reason}}
  end

  def handle_cast(:no_log, {channel, log, _store_log, start_time, user, handler, color, reason}) do
    {channel, log, false, start_time, user, handler, color, reason}
  end

  def handle_cast({:end, handler}, {_channel, _log, _store_log, _start_time, _user, handler, _color, _reason} = state) do
    GenServer.cast(self(), :done)
    {:noreply, state}
  end

  def handle_cast(:done, {channel, log, true, start_time, user, handler, _color, reason}) do
    Kaguya.Channel.get_users(channel)
    |> Enum.map(fn %{nick: nick} ->
      bot_name = Application.get_env(:kaguya, :bot_name)
      if nick != bot_name do
        sapart(nick, channel)
      end
    end)

    unix_time = Timex.Date.now(:secs)
    file_name = "#{channel} #{unix_time} #{user} #{handler}.log"
    log_string = serialize_log(log, user, handler, start_time, channel, reason)
    File.write!("#{Application.get_env(:support_bot, :log_path)}/#{file_name}", log_string)

    password = random_str(16)
    body = Poison.encode!(%{"key" => password, "body" => log_string, "name" => file_name})
    try do
      key = Application.get_env(:support_bot, :auth_key)
      paste_path =
        HTTPoison.post!("#{Application.get_env(:support_bot, :paste_create_url)}?authKey=#{key}", body)
        |> Map.fetch!(:body)
        |> Poison.decode!
        |> Map.fetch!("path")

      paste = "#{Application.get_env(:support_bot, :paste_fetch_url)}/#{paste_path}"
      Kaguya.Util.sendPM(
        "Support conversation in #{channel} between #{space_nick(user)} and #{space_nick(handler)} complete. A log can be found at #{paste} pw: #{password}",
        Application.get_env(:support_bot, :log_chan)
      )
    rescue
      _ -> 
        Kaguya.Util.sendPM(
          "Support conversation in #{channel} between #{space_nick(user)} and #{space_nick(handler)} complete. I could not properly upload the logs, but they are saved locally.",
          Application.get_env(:support_bot, :log_chan)
        )
    end
    {:stop, :normal, nil}
  end

  def handle_cast(:done, {channel, _log, false, _start_time, user, handler, _color, _reason}) do
    Kaguya.Util.sendPM(
      "Support conversation in #{channel} between #{space_nick(user)} and #{space_nick(handler)} complete. No logs saved.",
      Application.get_env(:support_bot, :log_chan)
    )
    {:stop, :normal, nil}
  end
end
