import { Agent, fetch as undiciFetch } from 'undici';

const openAIAgent = new Agent({
  keepAliveTimeout: 35_000,
  keepAliveMaxTimeout: 300_000,
});

process.once('SIGTERM', () => openAIAgent.close());
process.once('SIGINT', () => openAIAgent.close());

export function openAIFetch(
  url: string,
  options?: Parameters<typeof undiciFetch>[1]
): ReturnType<typeof undiciFetch> {
  return undiciFetch(url, {
    ...options,
    dispatcher: openAIAgent,
  });
}
