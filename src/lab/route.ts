export const LAB_ROUTE = "#/chart-lab";
export const BUILDER_ROUTE = "#/asset-builder";

/** The Lab is the home page; the Asset Builder has its own route. */
export function isBuilderHash(hash: string): boolean {
  return hash === BUILDER_ROUTE || hash.startsWith(`${BUILDER_ROUTE}?`) || hash.startsWith(`${BUILDER_ROUTE}/`);
}

export function isLabHash(hash: string): boolean {
  return hash === LAB_ROUTE || hash.startsWith(`${LAB_ROUTE}?`) || hash.startsWith(`${LAB_ROUTE}/`);
}
