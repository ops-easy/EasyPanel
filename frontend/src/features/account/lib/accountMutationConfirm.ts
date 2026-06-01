export function withAccountMutationConfirm<T extends object>(body: T): T & { confirm: true } {
  return { ...body, confirm: true };
}

export function withAccountMutationConfirmQuery(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}confirm=true`;
}
