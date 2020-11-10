defmodule SupportBot.Mixfile do
  use Mix.Project

  def project do
    [
     app: :support_bot,
     version: "1.5.0",
     elixir: ">= 1.9.0 and < 1.12.0",
     elixirc_options: [warnings_as_errors: true],
     build_embedded: Mix.env == :prod,
     start_permanent: Mix.env == :prod,
     deps: deps()
    ]
  end

  def application do
    [
      mod: {SupportBot, []}
    ]
  end

  defp deps do
    [
      {:kaguya, "== 0.6.6"},
      {:httpoison, "== 1.7.0"},
      {:timex, "== 3.6.2"},
      {:poison, "== 4.0.1"},
      {:puid, "== 1.1.1"},
      {:distillery, "== 2.1.1"}
    ]
  end
end
