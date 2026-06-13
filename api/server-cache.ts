const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

export function hasRedisConfig() {
  return Boolean(redisUrl && redisToken);
}

export async function redisCommand<T>(command: Array<string | number>): Promise<T | undefined> {
  if (!hasRedisConfig()) return undefined;

  const response = await fetch(redisUrl!, {
    method: "POST",
    headers: {
      authorization: `Bearer ${redisToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) throw new Error(`Upstash ${command[0]} returned ${response.status}`);
  const payload = (await response.json()) as { result?: T; error?: string };
  if (payload.error) throw new Error(payload.error);
  return payload.result;
}

export function parseJson<T>(value: unknown): T | undefined {
  if (typeof value !== "string") return undefined;

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}
