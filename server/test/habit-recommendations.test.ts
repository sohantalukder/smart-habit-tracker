import { describe, expect, it } from "vitest";
import { rankHabitRecommendations } from "../src/experience.controller";

function template(
  id: string,
  goal_tags: string[],
  recommendation_priority: number,
) {
  return {
    id,
    slug: id,
    name: id,
    description: "",
    category: "other",
    habit_type: "do",
    icon: "🌱",
    default_target: null,
    default_unit: null,
    default_frequency: { kind: "daily" },
    goal_tags,
    recommendation_priority,
  };
}

describe("habit recommendation ranking", () => {
  const templates = [
    template("move-1", ["movement"], 10),
    template("move-2", ["movement"], 20),
    template("sleep-1", ["sleep"], 10),
    template("sleep-2", ["sleep"], 20),
    template("learn-1", ["learning"], 10),
    template("learn-2", ["learning"], 20),
  ];

  it("round-robins selected goals and enforces pace caps", () => {
    expect(rankHabitRecommendations(
      templates,
      ["movement", "sleep"],
      "light",
    ).map((item) => item.id)).toEqual(["move-1", "sleep-1"]);
    expect(rankHabitRecommendations(
      templates,
      ["movement", "sleep", "learning"],
      "ambitious",
    )).toHaveLength(6);
  });
});
