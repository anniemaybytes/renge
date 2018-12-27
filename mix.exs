defmodule SupportBot.Mixfile do
  use Mix.Project

  def project do
    [app: :support_bot,
     version: "0.0.1",
     elixir: "~> 1.2",
     build_embedded: Mix.env == :prod,
     start_permanent: Mix.env == :prod,
     deps: deps()]
  end

  def application do
    [
      applications: [:logger, :httpoison, :kaguya],
      mod: {SupportBot, []}
    ]
  end

  defp deps do
    [
      {:kaguya, "~> 0.6.5"},
      {:httpoison, "~> 0.9.0"},
      {:timex, "~> 1.0"},
      {:poison, "~> 2.0"}
    ]
  end
end
