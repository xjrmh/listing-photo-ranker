"use client";

import React from "react";
import type { FeedbackRequest } from "@listing-photo-ranker/core/client";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getStatelessRankingSession } from "../lib/stateless-ranking-session";
import { RankingReviewWorkspace } from "./ranking-review-workspace";

function downloadFeedbackExport(payload: FeedbackRequest): string {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ranking-feedback.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return "Feedback JSON downloaded.";
}

export function StatelessResultsClient() {
  const [session] = useState(() => getStatelessRankingSession());
  const [previewUrlByImageId, setPreviewUrlByImageId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!session) {
      return;
    }

    const urls = session.files.map((file) => URL.createObjectURL(file));
    setPreviewUrlByImageId(
      Object.fromEntries(urls.map((url, index) => [`sync_${index + 1}`, url]))
    );

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [session]);

  if (!session) {
    return (
      <div className="card status-card status-card-error">
        <div className="stack-sm">
          <h2 className="section-title">Stateless result unavailable</h2>
          <p className="status-text error">
            This review page only works immediately after ranking in the same browser tab. If the page was refreshed or
            reopened, run the ranking again.
          </p>
        </div>
        <Link href="/" className="button button-secondary button-sm">
          Back to upload
        </Link>
      </div>
    );
  }

  return (
    <RankingReviewWorkspace
      result={session.result}
      headerMeta={`${session.result.method} · stateless · completed`}
      title="Review ranked gallery"
      subtitle="Edit labels and sequence, then export the feedback JSON locally."
      feedbackActionLabel="Export feedback JSON"
      feedbackPendingLabel="Preparing export..."
      idleFeedbackMessage="Ready to export feedback JSON"
      previewUrlByImageId={previewUrlByImageId}
      onSubmitFeedback={async (payload) => downloadFeedbackExport(payload)}
      actions={
        <Link href="/" className="button button-ghost button-sm">
          New ranking
        </Link>
      }
    />
  );
}
