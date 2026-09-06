/**
 * PostgREST (Supabase) enforces a server-side `db-max-rows` ceiling — 1000 rows
 * on the default plan — on EVERY response, regardless of the client `.limit()`.
 * A single `.limit(100000)` or `.range(0, 99999)` is silently clamped to 1000.
 *
 * fetchAllRows pages with `.range(from, to)` until a page comes back shorter
 * than the page size, which proves the table is exhausted.
 *
 * @param makeQuery  Runs one page: given an inclusive [from, to] range, resolves
 *                   to the Supabase `{ data, error }` shape.
 * @param pageSize   Rows per page. Must be <= the server cap (default 1000).
 */
export async function fetchAllRows<T>(
  makeQuery: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await makeQuery(from, from + pageSize - 1);
    if (error) throw new Error(error.message);

    const page = data ?? [];
    all.push(...page);

    if (page.length < pageSize) break; // short page → no more rows
    from += pageSize;
  }

  return all;
}
