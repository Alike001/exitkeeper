import { describe, expect, it } from "vitest";
import {
  getStagePresentation,
  type LifecycleStage,
  lifecycleStages,
} from "@/lib/lifecycle";

describe("ExitKeeper lifecycle", () => {
  it("keeps the delayed Lido lifecycle in its required order", () => {
    expect(lifecycleStages).toEqual([
      "reviewed",
      "requesting",
      "waiting",
      "claimable",
      "claiming",
      "returned",
    ]);
  });

  it.each(lifecycleStages)("has operator copy for %s", (stage) => {
    const presentation = getStagePresentation(stage);

    expect(presentation.label.length).toBeGreaterThan(0);
    expect(presentation.description.length).toBeGreaterThan(0);
  });

  it("does not describe an accepted trigger as completed", () => {
    const requesting = getStagePresentation("requesting");

    expect(requesting.label).not.toMatch(/complete|success/i);
    expect(requesting.description).toContain("submitting");
  });

  it("accepts stages inside the domain", () => {
    const stage: LifecycleStage = "waiting";

    expect(getStagePresentation(stage).label).toBe("Waiting for Lido");
  });
});
