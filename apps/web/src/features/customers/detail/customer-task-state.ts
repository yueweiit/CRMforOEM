export type ActiveTaskLike = {
  id: string;
  type: string;
};

export type GenerationAction = "website" | "research" | "oem";

export type GenerationDialogBusyState = {
  websitePending: boolean;
  researchPending: boolean;
  oemPending: boolean;
};

export function getActiveTaskSignature(tasks: ActiveTaskLike[]) {
  return [...tasks]
    .map((task) => taskIdentity(task))
    .sort()
    .join("|");
}

export function getCompletedActiveTaskTypes(previous: ActiveTaskLike[], current: ActiveTaskLike[]) {
  const currentIds = new Set(current.map(taskIdentity));
  const completedTypes: string[] = [];
  const seenTypes = new Set<string>();

  for (const task of previous) {
    if (currentIds.has(taskIdentity(task)) || seenTypes.has(task.type)) continue;
    completedTypes.push(task.type);
    seenTypes.add(task.type);
  }

  return completedTypes;
}

export function getGenerationDialogBusy(action: GenerationAction | null, state: GenerationDialogBusyState) {
  if (action === "website") return state.websitePending;
  if (action === "research") return state.researchPending;
  if (action === "oem") return state.oemPending;
  return false;
}

function taskIdentity(task: ActiveTaskLike) {
  return `${task.type}:${task.id}`;
}
