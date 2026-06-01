export function withAppCenterMutationConfirm<T extends Record<string, unknown>>(
  body: T
): T & { confirm: true } {
  return { ...body, confirm: true };
}

export function withAppCenterMutationConfirmQuery(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}confirm=true`;
}
