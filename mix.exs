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
      applications: [:logger, :httpoison, :kaguya, :tzdata],
      mod: {SupportBot, []}
    ]
  end

  defp deps do
    [
      {:kaguya, "~> 0.6.6"},
      {:httpoison, "~> 1.6"},
      {:timex, "~> 3.0"},
      {:poison, "~> 4.0"}
    ]
  end
end
