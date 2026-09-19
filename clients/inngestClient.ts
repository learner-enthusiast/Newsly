import { Inngest, type ClientOptions, type InngestFunction } from "inngest";
import { serve as serveInngest } from "inngest/next";
import { z } from "zod";

const inngestClientOptionsSchema = z.object({
  id: z.string().min(1).optional(),
  eventKey: z.string().min(1).optional(),
  isDev: z.boolean().optional(),
});

export type InngestClientOptions = z.input<typeof inngestClientOptionsSchema> &
  Omit<ClientOptions, "id" | "eventKey" | "isDev">;

export function createInngestClient(options: InngestClientOptions = {}) {
  const parsed = inngestClientOptionsSchema.parse({
    id: options.id ?? process.env.INNGEST_APP_ID,
    eventKey: options.eventKey ?? process.env.INNGEST_EVENT_KEY,
    isDev: options.isDev,
  });

  const client = new Inngest({
    ...options,
    id: parsed.id ?? "my-app",
    eventKey: parsed.eventKey,
    isDev: parsed.isDev,
  });

  const registered: InngestFunction.Like[] = [];

  const register = <T extends InngestFunction.Like>(
    ...fns: Array<T | readonly T[]>
  ): T[] => {
    const flattened = fns.flat() as T[];

    for (const fn of flattened) {
      if (!registered.includes(fn)) {
        registered.push(fn);
      }
    }

    return flattened;
  };

  const getFunctions = (functions?: readonly InngestFunction.Like[]) => {
    if (functions) {
      return [...functions];
    }

    return [...client.funcs, ...registered];
  };

  return {
    client,
    createFunction: client.createFunction.bind(client),
    register,
    send: client.send.bind(client),
    get functions() {
      return getFunctions();
    },
    serve(functions?: readonly InngestFunction.Like[]) {
      return serveInngest({
        client,
        functions: getFunctions(functions),
      });
    },
  };
}

export const inngestClient = createInngestClient();
export const inngest = inngestClient.client;
