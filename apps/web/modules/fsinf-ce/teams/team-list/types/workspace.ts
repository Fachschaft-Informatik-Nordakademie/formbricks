import { z } from "zod";

/** FSINF CE: the minimal workspace shape used by team and API-key settings (id + display name). */
export const ZOrganizationWorkspace = z.object({
  id: z.string(),
  name: z.string(),
});

export type TOrganizationWorkspace = z.infer<typeof ZOrganizationWorkspace>;
