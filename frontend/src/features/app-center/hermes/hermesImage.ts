export const HERMES_DEFAULT_IMAGE = "nousresearch/hermes-agent:latest";

const HERMES_LEGACY_GHCR_IMAGE = "ghcr.io/nousresearch/hermes-agent:latest";

export function normalizeHermesImage(image?: string | null): string {
  const value = (image ?? "").trim();
  return value === HERMES_LEGACY_GHCR_IMAGE ? HERMES_DEFAULT_IMAGE : value;
}
