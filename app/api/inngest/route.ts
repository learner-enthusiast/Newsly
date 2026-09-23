import { inngestClient } from "@/clients/inngestClient";
import { inngestFunctions } from "@/inngest";

export const { GET, POST, PUT } = inngestClient.serve(inngestFunctions);
