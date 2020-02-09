defmodule SupportBot.Mixfile do
  use Mix.Project

  def project do
    [
     app: :support_bot,
     version: "1.3.1",
     elixir: "~> 1.8",
     elixirc_options: [warnings_as_errors: true],
     build_embedded: Mix.env == :prod,
     start_permanent: Mix.env == :prod,
     deps: deps()
    ]
  end

  def application do
    [
      applications: [:logger, :httpoison, :tzdata, :kaguya],
      mod: {SupportBot, []}
    ]
  end

  defp deps do
    [
      {:kaguya, "~> 0.6.6"},
      {:httpoison, "~> 1.6"},
      {:timex, "~> 3.0"},
      {:poison, "~> 4.0"},
      {:puid, "~> 1.0"}
    ]
  end
end
