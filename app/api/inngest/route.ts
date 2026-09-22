import { inngestClient } from "@/clients/inngestClient";
import "@/inngest/functions/news/pipeline";

export const { GET, POST, PUT } = inngestClient.serve();
