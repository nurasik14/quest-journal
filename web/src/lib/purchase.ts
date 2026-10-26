/**
 * Buying is charged once, even when the answer gets lost (psychologist-AC19, backlog #238). Pure (no runes):
 * the retry after a network failure or a timeout sends the SAME `request_id`, and the server replays a committed
 * purchase as `changed:false` instead of charging again. Any other error is a definite answer and is rethrown.
 */
import { NetworkError } from './http';

export async function buyWithRetry<R>(buy: (itemId: string, requestId: string) => Promise<R>, itemId: string, requestId: string): Promise<R> {
  try {
    return await buy(itemId, requestId);
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
    return await buy(itemId, requestId); // one retry, same key
  }
}
