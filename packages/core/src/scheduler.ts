import { Inngest } from "inngest";

export interface JobScheduler {
  enqueueRanking(rankingId: string): Promise<void>;
}

export class InlineJobScheduler implements JobScheduler {
  constructor(private readonly worker: (rankingId: string) => Promise<void>) {}

  async enqueueRanking(rankingId: string): Promise<void> {
    queueMicrotask(() => {
      void this.worker(rankingId);
    });
  }
}

export class InngestJobScheduler implements JobScheduler {
  constructor(
    private readonly inngest: Inngest,
    private readonly eventName = "ranking/requested"
  ) {}

  async enqueueRanking(rankingId: string): Promise<void> {
    await this.inngest.send({
      name: this.eventName,
      data: { rankingId }
    });
  }
}

