import { createInngestClient, getApp } from "@listing-photo-ranker/core";
import { serve } from "inngest/next";

const app = getApp();
const inngest = app.inngest ?? createInngestClient();

const rankingProcessor = inngest.createFunction(
  { id: "process-ranking-job" },
  { event: "ranking/requested" },
  async ({ event }) => {
    await getApp().processRankingJob(event.data.rankingId as string);
    return { rankingId: event.data.rankingId };
  }
);

export const runtime = "nodejs";
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [rankingProcessor]
});

