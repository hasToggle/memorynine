import { StripeAgentToolkit } from "@stripe/agent-toolkit/ai-sdk";
import { keys } from "./keys";

export const paymentsAgentToolkit = new StripeAgentToolkit({
  configuration: {},
  secretKey: keys().STRIPE_SECRET_KEY,
});
