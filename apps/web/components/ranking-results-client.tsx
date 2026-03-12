"use client";

import type { FeedbackRequest, RankingJob } from "@listing-photo-ranker/core/client";
import Link from "next/link";
import { useEffect, useState } from "react";

import { RankingReviewWorkspace } from "./ranking-review-workspace";

type RankingResultsClientProps = {
  rankingId: string;
};

export function RankingResultsClient({ rankingId }: RankingResultsClientProps) {
  const [job, setJob] = useState<RankingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchRanking() {
      try {
        const response = await fetch(`/api/v1/rankings/${rankingId}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error((await response.json()).error ?? "Failed to load ranking.");
        }

        const nextJob = (await response.json()) as RankingJob;
        if (!active) return;

        setJob(nextJob);
        setError(null);
        setLoading(false);

        if (nextJob.status === "pending" || nextJob.status === "processing") {
          window.setTimeout(fetchRanking, 1500);
        }
      } catch (fetchError) {
        if (!active) return;
        setLoading(false);
        setError(fetchError instanceof Error ? fetchError.message : "Unable to fetch ranking.");
      }
    }

    void fetchRanking();

    return () => {
      active = false;
    };
  }, [rankingId]);

  async function submitFeedback(payload: FeedbackRequest): Promise<string> {
    const response = await fetch(`/api/v1/rankings/${rankingId}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error((await response.json()).error ?? "Unable to submit feedback.");
    }

    return "Feedback captured successfully.";
  }

  if (loading) {
    return (
      <div className="card status-card">
        <div className="status-dot status-dot-live" />
        <div className="stack-sm">
          <h2 className="section-title">Ranking in progress</h2>
          <p className="helper-text">Polling job {rankingId}. The workspace will update automatically.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card status-card status-card-error">
        <div className="stack-sm">
          <h2 className="section-title">Unable to load ranking</h2>
          <p className="status-text error">{error}</p>
        </div>
        <Link href="/" className="button button-secondary button-sm">
          Start over
        </Link>
      </div>
    );
  }

  if (!job) {
    return null;
  }

  if (!job.result) {
    return (
      <div className="card status-card status-card-error">
        <div className="stack-sm">
          <h2 className="section-title">{job.status === "failed" ? "Ranking failed" : "Ranking in progress"}</h2>
          <p className={`status-text${job.status === "failed" ? " error" : ""}`}>
            {job.error ?? (job.status === "processing" || job.status === "pending"
              ? "Still running — page polls automatically."
              : "No ranking result is available.")}
          </p>
        </div>
        <div className="button-row">
          <button className="button button-secondary button-sm" type="button" onClick={() => window.location.reload()}>
            Refresh
          </button>
          <Link href="/" className="button button-ghost button-sm">
            New ranking
          </Link>
        </div>
      </div>
    );
  }

  return (
    <RankingReviewWorkspace
      result={job.result}
      headerMeta={`${job.ranking_id} · ${job.method} · ${job.status}`}
      warningMessage={job.status === "failed" ? job.error ?? "Ranking failed." : null}
      feedbackActionLabel="Save feedback"
      feedbackPendingLabel="Saving..."
      onSubmitFeedback={submitFeedback}
      actions={
        <>
          <button className="button button-secondary button-sm" type="button" onClick={() => window.location.reload()}>
            Refresh
          </button>
          <Link href="/" className="button button-ghost button-sm">
            New ranking
          </Link>
        </>
      }
    />
  );
}
