export const LAB_ROUTE = "#/chart-lab";

export function isLabHash(hash: string): boolean {
  return hash === LAB_ROUTE || hash.startsWith(`${LAB_ROUTE}?`) || hash.startsWith(`${LAB_ROUTE}/`);
}
