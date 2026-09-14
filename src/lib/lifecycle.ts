export const lifecycleStages = [
  "reviewed",
  "requesting",
  "waiting",
  "claimable",
  "claiming",
  "returned",
] as const;

export type LifecycleStage = (typeof lifecycleStages)[number];

type StagePresentation = {
  label: string;
  description: string;
};

const stagePresentations: Record<LifecycleStage, StagePresentation> = {
  reviewed: {
    label: "Reviewed",
    description: "The exact KeeperHub request workflow is fixed and approved.",
  },
  requesting: {
    label: "Requesting",
    description: "KeeperHub is submitting the reviewed request to Lido.",
  },
  waiting: {
    label: "Waiting for Lido",
    description:
      "Wayfinder monitors the queue until Lido finalizes the request.",
  },
  claimable: {
    label: "Claimable",
    description: "Ownership and finalization are fresh and ready for review.",
  },
  claiming: {
    label: "Claiming",
    description: "KeeperHub is executing the owner-directed claim workflow.",
  },
  returned: {
    label: "ETH returned",
    description: "The claim receipt and final Lido status are verified.",
  },
};

export function getStagePresentation(stage: LifecycleStage): StagePresentation {
  return stagePresentations[stage];
}
