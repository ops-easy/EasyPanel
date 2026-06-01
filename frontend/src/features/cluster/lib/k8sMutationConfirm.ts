export function withK8sMutationConfirm<T extends object>(body: T): T & { confirm: true } {
  return { ...body, confirm: true };
}

export function withK8sMutationConfirmQuery(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}confirm=true`;
}
