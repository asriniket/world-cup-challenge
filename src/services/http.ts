export const noStoreJsonRequest: RequestInit = {
  cache: "no-store",
  headers: { accept: "application/json" },
};

export function freshEndpoint(endpoint: string) {
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}_=${Date.now()}`;
}
