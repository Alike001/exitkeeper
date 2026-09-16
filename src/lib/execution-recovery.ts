export type RecoverableJobStatus =
  | "attention-required"
  | "request-submitted"
  | "request-confirmed"
  | "claim-submitted";

type StageState =
  | "prepared"
  | "accepted"
  | "running"
  | "succeeded"
  | "failed"
  | "uncertain";

export function recoveredJobStatus(stages: {
  approval?: StageState;
  request?: StageState;
  claim?: StageState;
}): RecoverableJobStatus {
  if (stages.claim === "succeeded") return "claim-submitted";
  if (stages.request === "succeeded") return "request-confirmed";
  if (stages.approval === "succeeded" && stages.request === "prepared") {
    return "request-submitted";
  }
  return "attention-required";
}
