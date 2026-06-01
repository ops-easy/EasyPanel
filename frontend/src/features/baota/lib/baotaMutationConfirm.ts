export function withBaotaMutationConfirm<T extends object>(body: T): T & { confirm: true } {
  return { ...body, confirm: true };
}
