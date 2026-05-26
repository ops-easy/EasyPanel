export type SingletonPveTarget = {
  id: string;
  name: string;
  baseUrl: string;
};

export function singlePveTarget<T extends SingletonPveTarget>(
  targets: T[] | null | undefined
): T | undefined {
  return targets?.find((target) => Boolean(target.id)) ?? undefined;
}

export function pveTargetConfigured<T extends SingletonPveTarget>(
  targets: T[] | null | undefined
): boolean {
  return Boolean(singlePveTarget(targets));
}
