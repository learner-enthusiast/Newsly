import { inngestClient } from "@/clients/inngestClient";
import { inngestFunctions } from "@/inngest";

export const runtime = "nodejs";
export const maxDuration = 300;

export const { GET, POST, PUT } = inngestClient.serve(inngestFunctions);
