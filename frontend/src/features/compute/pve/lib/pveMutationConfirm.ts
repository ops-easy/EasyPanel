export function withPveMutationConfirm<T extends object>(body: T): T & { confirm: true } {
  return { ...body, confirm: true };
}

export function withPveMutationConfirmQuery(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}confirm=true`;
}
