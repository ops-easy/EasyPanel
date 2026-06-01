export function withNetworkMutationConfirm<T extends object>(body: T): T & { confirm: true } {
  return { ...body, confirm: true };
}

export function withNetworkMutationConfirmQuery(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}confirm=true`;
}
