import { inngestClient } from "@/clients/inngestClient";
import { planCreated } from "@/inngest/functions/planCreated";

export const { GET, POST, PUT } = inngestClient.serve([planCreated]);
