import { Agent, fetch as undiciFetch } from 'undici';

const elevenLabsAgent = new Agent({
  keepAliveTimeout: 35_000,
  keepAliveMaxTimeout: 300_000,
});

process.once('SIGTERM', () => elevenLabsAgent.close());
process.once('SIGINT', () => elevenLabsAgent.close());

export function elevenLabsFetch(
  url: string,
  options?: Parameters<typeof undiciFetch>[1]
): ReturnType<typeof undiciFetch> {
  return undiciFetch(url, {
    ...options,
    dispatcher: elevenLabsAgent,
  });
}
