export function withHarborMutationConfirm<T extends object>(body: T): T & { confirm: true } {
  return { ...body, confirm: true };
}

export function withHarborMutationConfirmQuery(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}confirm=true`;
}
