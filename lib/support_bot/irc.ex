defmodule SupportBot.IRC do
  use Kaguya.Module, "support"

  def module_init do
    try do
      :ets.new(:unqueued_users, [:set, :named_table, :public, {:read_concurrency, true}, {:write_concurrency, true}])
      Agent.start_link(fn -> current_repo_version() end, name: VersionHandler)
    rescue
      # Table already exists.
      ArgumentError -> :ok
    end
  end

  def current_repo_version do
    {hash, _code} = System.cmd "git", ["rev-parse", "HEAD"]
    String.slice(hash, 0..6)
  end

  def in_staff_support(%{args: [chan]}) do
    Enum.member?(Application.get_env(:support_bot, :staff_support_chans), chan)
  end

  def in_user_support(%{command: "JOIN", trailing: chan}) do
    Enum.member?(Application.get_env(:support_bot, :user_support_chans), chan)
  end

  def in_user_support(%{command: "KICK", args: [chan, _user]}) do
    Enum.member?(Application.get_env(:support_bot, :user_support_chans), chan)
  end

  def in_user_support(%{args: [chan]}) do
    Enum.member?(Application.get_env(:support_bot, :user_support_chans), chan)
  end

  def in_support_session(%{args: [chan]}) do
    Enum.member?(Application.get_env(:support_bot, :support_session_chans), chan)
  end

  def in_support_session(%{trailing: chan}) do
    Enum.member?(Application.get_env(:support_bot, :support_session_chans), chan)
  end

  def has_non_staff_vhost(msg = %{user: %{nick: nick}}) do
    bot_name = Application.get_env(:kaguya, :bot_name)
    !has_staff_vhost(msg) && nick != bot_name
  end

  def is_session_handler(msg = %{user: %{nick: nick}, args: [chan]}) do
    in_support_session(msg) &&
    GenServer.call(String.to_atom(chan), :handler) == nick
  end

  def has_staff_vhost (%{user: user}) do
    Enum.any?(Application.get_env(:support_bot, :staff_vhosts), fn pat ->
      SupportBot.Util.match_user(user, pat)
    end)
  end

  handle "PRIVMSG" do
    enforce :in_staff_support do
      match "!handle", :support_handler
      match "!handle :pos", :support_handler, match_group: "[0-9]+"
      match "!handle :nick", :support_handler, match_group: "[a-zA-Z_-][a-zA-Z0-9_-]+"
      match "!unqueue :pos", :force_unqueue, match_group: "[0-9]+"
      match "!unqueue :nick", :force_unqueue, match_group: "[a-zA-Z][a-zA-Z0-9_-]+"
      enforce :has_staff_vhost do
        match "!reenable :user([a-zA-Z0-9_-]+) :reason(.+)", :staff_reenable_handler, async: true
      end
      match "!queue", :disp_queue
    end

    enforce [:in_user_support, :has_staff_vhost] do
      match "!handle :nick ~reason", :manual_handle, match_group: "[a-zA-Z][a-zA-Z0-9_-]+"
    end

    enforce :in_user_support do
      match "!queue", :ask_for_queue_message
      match "!queue ~message", :enter_queue
      match "!unqueue", :leave_queue
    end

    enforce :has_staff_vhost do
      match "!reenable :user", :staff_reenable_handler, match_group: "[a-zA-Z0-9_-]+", async: true
      match "!reload", :module_reloader
      match "!version", :version_disp
    end

    enforce [:has_non_staff_vhost, :in_user_support] do
      match "!reenable ~user", :user_reenable_handler, async: true
    end

    enforce :in_support_session do
      match_all :log_message
    end

    # Something's weird with this macro, troubleshoot later
    enforce [:is_session_handler] do
      match "!end", :end_session
    end
  end

  handle "JOIN" do
    enforce [:has_non_staff_vhost, :in_user_support] do
      match_all :display_welcome_msg
      match_all :start_queue_timer
    end

    enforce :in_support_session do
      match_all :log_message
    end
  end

  handle "001" do
    name = Application.get_env(:kaguya, :bot_name)
    oper_name = Application.get_env(:support_bot, :oper_name)
    oper_pass = Application.get_env(:support_bot, :oper_pass)
    :ok = GenServer.call(Kaguya.Core, {:send, %Kaguya.Core.Message{command: "OPER", args: [oper_name, oper_pass]}})
    :ok = GenServer.call(Kaguya.Core, {:send, %Kaguya.Core.Message{command: "CHGIDENT", args: [name, name]}})
    :ok = GenServer.call(Kaguya.Core, {:send, %Kaguya.Core.Message{command: "CHGHOST", args: [name, "bakus.dungeon"]}})
    SupportBot.Util.mode(name, "+B")
    for channel <- Application.get_env(:kaguya, :channels) do
      SupportBot.Util.sajoin(name, channel)
    end
    for channel <- Application.get_env(:support_bot, :support_session_chans) do
      Kaguya.Channel.join(channel)
      SupportBot.Util.sajoin(name, channel)
      for user <- Kaguya.Channel.get_users(channel) do
        SupportBot.Util.sapart(user.nick, channel)
      end
      SupportBot.Util.mode(channel, "+ins")
      for vhost <- Application.get_env(:support_bot, :staff_vhosts) do
        SupportBot.Util.mode(channel, "+I", [vhost])
      end
    end
  end

  handle "PART" do
    enforce :in_support_session do
      match_all :log_message
      match_all :is_session_over?
    end

    enforce :in_user_support do
      match_all :leave_queue_quiet
      match_all :leave_unqueued_users
    end
  end

  handle "KICK" do
    enforce :in_user_support do
      match_all :leave_queue_kick
    end

    enforce :in_support_session do
      match_all :log_message
    end
  end

  handle "QUIT" do
    for channel <- Application.get_env(:support_bot, :support_session_chans) do
      [{^channel, pid}] = :ets.lookup(:channels, channel)
      case GenServer.call(pid, {:get_user, message.user.nick}) do
        nil -> nil
        _ -> GenServer.cast(String.to_atom(channel), {:log, message})
      end

      is_session_over?(%{args: [channel], user: message.user}, %{})
    end
    match_all :leave_queue_quiet
    match_all :leave_unqueued_users
  end

  handle "NICK" do
    for channel <- Application.get_env(:support_bot, :support_session_chans) do
      [{^channel, pid}] = :ets.lookup(:channels, channel)
      case GenServer.call(pid, {:get_user, message.user.nick}) do
        nil -> nil
        _ -> GenServer.cast(String.to_atom(channel), {:log, message})
      end
    end
    match_all :rename_unqueued_user
    match_all :rename_queued_user
  end

  def find_free_chan do
    Enum.find(Application.get_env(:support_bot, :support_session_chans), fn chan ->
      Process.whereis(String.to_atom(chan)) == nil
    end)
  end

  defh module_reloader do
    IEx.Helpers.r(SupportBot.IRC)
    IEx.Helpers.r(SupportBot.Queue)
    IEx.Helpers.r(SupportBot.Util)
    IEx.Helpers.r(SupportBot.SupportSession)
    cv = current_repo_version()
    reply "Code reloaded! Now running at commit #{cv}"
    Agent.update(VersionHandler, fn _ov -> cv end)
  end

  defh version_disp do
    reply "Currently running commit #{Agent.get(VersionHandler, fn cv -> cv end)}, repository at commit #{current_repo_version()}"
  end

  defh start_queue_timer(%{user: %{nick: user}, trailing: chan}) do
    add_to_unqueued_users(user, chan)
  end

  defh leave_unqueued_users(%{user: %{nick: user}}) do
    rem_from_unqueued_users(user)
  end

  defh rename_unqueued_user(%{user: %{nick: old_nick}, trailing: nick}) do
    rename_unqueued_users(old_nick, nick)
  end

  defh rename_queued_user(%{user: %{nick: old_nick}, trailing: nick}) do
    GenServer.call(SupportBot.Queue, {:rename, {old_nick, nick}})
    rename_unqueued_users(old_nick, nick)
  end

  defp in_unqueued_users(nick) do
    :ets.foldl(fn {org_nick, cur_nick}, acc ->
      if nick == cur_nick do
        org_nick
      else
        acc
      end
    end, nil, :unqueued_users)
  end

  def add_to_unqueued_users(nick, sup_chan) do
    :ets.insert(:unqueued_users, {nick, nick})
    Task.start(fn ->
      :timer.sleep(5000)
      user = Kaguya.Channel.get_user(sup_chan, nick)
      if user == nil || user.mode != :op do
        :timer.sleep(Application.get_env(:support_bot, :idle_alert_time, 300000))
        case :ets.lookup(:unqueued_users, nick) do
          [{^nick, current_nick}] ->
            Kaguya.Util.sendPM("Hi #{current_nick}, we do not allow idling in support channels. Please queue with !queue <reason> or part the channel.", sup_chan)
            :timer.sleep(Application.get_env(:support_bot, :idle_kick_time, 900000))
            case :ets.lookup(:unqueued_users, nick) do
              [{^nick, current_nick}] ->
                SupportBot.Util.sapart(current_nick, sup_chan)
                rem_from_unqueued_users(current_nick)
              _ -> nil
            end
          _ -> nil
        end
      end
    end)
  end

  defp rem_from_unqueued_users(nick) do
    org_nick = in_unqueued_users(nick)
    if org_nick != nil do
      :ets.delete(:unqueued_users, org_nick)
    end
  end

  defp rename_unqueued_users(old_nick, new_nick) do
    org_nick = in_unqueued_users(old_nick)
    if org_nick != nil do
      :ets.delete(:unqueued_users, org_nick)
      :ets.insert(:unqueued_users, {org_nick, new_nick})
    end
  end

  defh manual_handle(%{user: %{nick: handler}}, %{"nick" => user, "reason" => reason}) do
    case find_free_chan() do
      nil -> reply "All available support channels are in use!"
      chan ->
        rem_from_unqueued_users(user)
        begin_support_session(user, handler, chan, reason, false)
    end
  end

  defh support_handler(%{user: %{nick: handler}}, %{"pos" => pos_str}) do
    pos = String.to_integer(pos_str) - 1
    case find_free_chan() do
      nil -> reply "All available support channels are in use!"
      chan -> 
        case GenServer.call(SupportBot.Queue, {:dequeue_ith, pos}) do
          nil -> reply "That queue position doesn't exist!"
          {user, reason, _time, ip} -> begin_support_session(user, handler, chan, reason, true, ip)
        end
    end
  end

  defh support_handler(%{user: %{nick: handler}}, %{"nick" => nick}) do
    case find_free_chan() do
      nil -> reply "All available support channels are in use!"
      chan -> 
        case GenServer.call(SupportBot.Queue, {:dequeue_nick_data, nick}) do
          nil -> reply "That user is not in the queue!"
          {user, reason, _time, ip} -> begin_support_session(user, handler, chan, reason, true, ip)
        end
    end
  end

  defh support_handler(%{user: %{nick: handler}}) do
    case find_free_chan() do
      nil -> reply "All available support channels are in use!"
      chan -> 
        case GenServer.call(SupportBot.Queue, :dequeue) do
          nil -> reply "There is no one in the queue!"
          {user, reason, _time, ip} -> begin_support_session(user, handler, chan, reason, true, ip)
        end
    end
  end

  defp begin_support_session(user, handler, chan, reason, announce, ip \\ "N/A") do
    if announce do
      if GenServer.call(SupportBot.Queue, :length) > 0 do
        for us_chan <- Application.get_env(:support_bot, :user_support_chans) do
          {next_user, _reason, _time, _ip} = GenServer.call(SupportBot.Queue, :peek)
          Kaguya.Util.sendPM("Now helping #{user}. Next in queue: #{next_user}", us_chan)
        end
      else
        for us_chan <- Application.get_env(:support_bot, :user_support_chans) do
          Kaguya.Util.sendPM("Now helping #{user}", us_chan)
        end
      end
    end

    Kaguya.Util.sendNotice(
      "Starting support session for #{user} in #{chan}, user IP: #{ip}",
      handler
    )

    SupportBot.Util.sapart(user, hd(Application.get_env(:support_bot, :user_support_chans)))
    {:ok, _pid} = Supervisor.start_child(
      SupportBot.SupportSessionSup,
      [{chan, user, handler, reason}, [name: String.to_atom(chan)]]
    )
  end

  defh join_support_chans do
  end

  defh display_welcome_msg(%{user: %{nick: nick}, trailing: chan}) do
    welcome_msg = "Hi #{nick}! If you need your account re-enabled please type !reenable <your username>. Otherwise please enter the support queue with !queue <reason you need assistance>."
    Kaguya.Util.sendPM(welcome_msg, chan)
  end

  defh disp_queue do
    queue = GenServer.call(SupportBot.Queue, :view)

    if length(queue) == 0 do
      reply "No users are queued!"
    else
      queue
      |> Enum.reverse
      |> Enum.with_index
      |> Enum.map(fn {{user, msg, time, _ip}, i} ->
        now = Timex.now()
        hours = Timex.diff(now, time, :hours)
        nt = Timex.subtract(now, Timex.Duration.from_seconds(hours * 60 * 60))
        minutes = Timex.diff(nt, time, :minutes)
        td =
          case {hours, minutes} do
            {0, 0} -> "just now"
            {0, 1} -> "a minute ago"
            {0, m} -> "#{m} minutes ago"
            {1, _} -> "one hour ago"
            {h, _} -> "#{h} hours ago"
          end
        case msg do
          "" -> reply "#{i + 1}. #{user} - #{td}"
          msg -> reply "#{i + 1}. #{user} - #{msg} - #{td}"
        end
      end)
    end
  end

  defh ask_for_queue_message do
    reply "Please supply a short reason, e.g. !queue disabled account"
  end

  defh enter_queue(%{user: %{nick: nick}, args: [_chan]}, %{"message" => msg_inp}) do
    msg =
      if String.starts_with?(msg_inp, "<") do
        msg_inp
        |> String.trim_leading("<")
        |> String.trim_trailing(">")
      else
        msg_inp
      end

    if String.length(msg) >= 140 do
      reply "Sorry, your reason is a bit too long. Mind cutting it down to 140 characters and trying again?"
    else
      case GenServer.call(SupportBot.Queue, {:enqueue, {nick, msg}}) do
        :ok ->
          rem_from_unqueued_users(nick)
          reply "You've been added to the queue!"
        :dupe -> reply "You're already in the queue! If you'd like to leave just type !unqueue or part the channel."
      end
    end
  end

  defh staff_reenable_handler(%{user: %{rdns: vhost}}, %{"user" => user_inp, "reason" => reason}) do
    case staff_reenable(vhost, user_inp, reason) do
      {:error, _reason} -> reply "Account could not be reenabled for technical reasons. Please try again."
      %{"success" => true} ->
        reply "User reenabled!"
      %{"reason" => r} -> reply "Could not reenable #{user_inp}: #{r}"
      _ -> reply "Could not reenable user."
    end
  end

  defh staff_reenable_handler(%{user: %{rdns: vhost}}, %{"user" => user_inp}) do
    case staff_reenable(vhost, user_inp, nil) do
      {:error, _reason} -> reply "Account could not be reenabled for technical reasons. Please try again."
      %{"success" => true} ->
        if in_support_session(var!(message)) do
          reply "User reenabled! Welcome back #{user_inp}, to prevent inactivity pruning from here on, you are required to visit the site within a ten week period per cycle. Reenables are a very limited service and repeat prunes will lead to permanent account closure. Please re-read the rules again: https://animebytes.tv/rules"
        else
          reply "User reenabled!"
        end
      %{"reason" => r} -> reply "Could not reenable #{user_inp}: #{r}"
      _ -> reply "Could not reenable user."
    end
  end

  def staff_reenable(vhost, user_inp, reason) do
    [enabler, _, _] = String.split(vhost, ".")
    user =
      if String.starts_with?(user_inp, "<") do
        user_inp
        |> String.trim_leading("<")
        |> String.trim_trailing(">")
      else
        user_inp
      end
    key = Application.get_env(:support_bot, :auth_key)
    location = Application.get_env(:support_bot, :user_reenable_api)

    url = "#{location}/#{URI.encode(user)}/staff"
    body =
      case reason do
        nil -> [{:enabler, enabler}, {:authKey, key}]
        r -> [{:enabler, enabler}, {:reason, r}, {:authKey, key}]
      end
    case HTTPoison.post(url, {:form, body}, [], [timeout: 10000]) do
      {:ok, resp} ->
        try do
          Poison.Parser.parse!(resp.body, %{})
        rescue
          e in ParseError -> e
        end
    end
  end

  defh user_reenable_handler(%{user: %{nick: nick}}, %{"user" => user_inp}) do
    user =
      if String.starts_with?(user_inp, "<") do
        user_inp
        |> String.trim_leading("<")
        |> String.trim_trailing(">")
      else
        user_inp
      end
    key = Application.get_env(:support_bot, :auth_key)
    location = Application.get_env(:support_bot, :user_reenable_api)
    url = "#{location}/#{user}/user"
    result =
    case HTTPoison.post(url, {:form, [{:authKey, key}]}, [], [timeout: 10000]) do
      {:ok, resp} ->
        try do
          Poison.Parser.parse!(resp.body, %{})
        rescue
          e in ParseError -> e
        end
    end  
    case result do
      {:error, _reason} -> reply "Your account could not be reenabled for technical reasons. Please try again."
      %{"success" => true} -> reply "User reenabled! Welcome back #{user}, to prevent inactivity pruning from here on, you are required to visit the site within a ten week period per cycle. Reenables are a very limited service and repeat prunes will lead to permanent account closure. Please re-read the rules again: https://animebytes.tv/rules"
      %{"reason" => "user does not exist"} -> reply "#{user} does not exist."
      %{"reason" => "user is already enabled"} -> reply "Your account is already enabled."
      %{"id" => _id} ->
        reply "Your account could not be automatically reenabled! You've been added to the support queue, please wait for assistance."
        profile_url = Application.get_env(:support_bot, :user_profile_location)
        rem_from_unqueued_users(nick)
        GenServer.call(SupportBot.Queue, {:enqueue, {nick, "User #{user} ( #{profile_url}#{user} ) needs staff reenabling."}})
    end
  end

  defh force_unqueue(_, %{"pos" => pos_str}) do
    pos = String.to_integer(pos_str) - 1
    case GenServer.call(SupportBot.Queue, {:dequeue_ith, pos}) do
      nil -> reply "No one is queued in that position."
      _ -> reply "Removed that user from the queue."
    end
  end

  defh force_unqueue(_, %{"nick" => nick}) do
    case GenServer.call(SupportBot.Queue, {:dequeue_nick, nick}) do
      nil -> reply "No one is queued with that nick."
      _ -> reply "Removed that user from the queue."
    end
  end

  defh leave_queue(%{user: %{nick: nick}}) do
    case GenServer.call(SupportBot.Queue, {:dequeue_nick, nick}) do
      ^nick -> reply "You've been removed from the queue!"
      _ ->
        reply "You're not in the queue!"
    end
  end

  defh leave_queue_kick(%{args: [_chan, nick]}) do
    rem_from_unqueued_users(nick)
    GenServer.call(SupportBot.Queue, {:dequeue_nick, nick})
  end

  defh leave_queue_quiet(%{user: %{nick: nick}}) do
    GenServer.call(SupportBot.Queue, {:dequeue_nick, nick})
  end

  defh log_message(%{args: [chan]}) do
    GenServer.cast(String.to_atom(chan), {:log, message})
  end

  defh log_message(%{trailing: chan, user: %{nick: nick}}) do
    name = Application.get_env(:kaguya, :bot_name)
    if nick != name do
      GenServer.cast(String.to_atom(chan), {:log, message})
    end
  end

  defh is_session_over?(%{args: [chan], user: %{nick: _nick}}) do
    :timer.sleep(100)
    bot_nick = Application.get_env(:kaguya, :bot_name)
    p = String.to_atom(chan)
    only_staff_left? =
      Kaguya.Channel.get_users(chan)
      |> Enum.all?(fn %{nick: nick} ->
        nick == bot_nick ||
        Enum.any?(
          Application.get_env(:support_bot, :staff_vhosts),
          fn pat ->
            SupportBot.Util.match_user(Kaguya.Util.getWhois(nick), pat)
          end
        )
      end)
    if only_staff_left? && Process.whereis(p) != nil do
      GenServer.cast(p, :done)
    end
  end

  defh end_session(%{args: [chan], user: %{nick: _nick}}) do
    GenServer.cast(String.to_atom(chan), :done)
  end
end
