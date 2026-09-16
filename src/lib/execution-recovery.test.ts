import { describe, expect, it } from "vitest";
import { recoveredJobStatus } from "@/lib/execution-recovery";

describe("KeeperHub execution recovery", () => {
  it("resumes at the unsubmitted request after approval succeeds", () => {
    expect(
      recoveredJobStatus({ approval: "succeeded", request: "prepared" }),
    ).toBe("request-submitted");
  });

  it("advances a recovered request to Wayfinder observation", () => {
    expect(
      recoveredJobStatus({ approval: "succeeded", request: "succeeded" }),
    ).toBe("request-confirmed");
  });

  it("requires Wayfinder confirmation after a recovered claim", () => {
    expect(recoveredJobStatus({ claim: "succeeded" })).toBe("claim-submitted");
  });

  it("does not guess while an execution remains uncertain", () => {
    expect(
      recoveredJobStatus({ approval: "succeeded", request: "uncertain" }),
    ).toBe("attention-required");
  });
});
