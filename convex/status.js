import { query } from "./_generated/server";

export const health = query({
  args: {},
  handler: async () => ({ ok: true }),
});
