import { defineAgent } from "eve";

// The chat surface over the knowledge base. Retrieval is a tool rather than
// pre-stuffed context: the model decides what to look up, and the reader can
// see which facts an answer rests on.
//
// The model is routed through the Vercel AI Gateway, the same path the
// extraction worker uses. KNOWLEDGE_CHAT_MODEL overrides it per environment
// without a code change.
export default defineAgent({
  model: process.env.KNOWLEDGE_CHAT_MODEL ?? "deepseek/deepseek-v4-flash-0731",
});
