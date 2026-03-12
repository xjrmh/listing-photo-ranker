"use client";

import { VIEW_TYPES, type FeedbackRequest, type RankedPhoto, type RankingJob } from "@listing-photo-ranker/core/client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type RankingResultsClientProps = {
  rankingId: string;
};

type EditablePhoto = RankedPhoto & {
  edited_view_type: string;
  edited_tags: string;
};

function formatLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function formatScore(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function reorder<T extends { position: number }>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((item, index) => ({ ...item, position: index + 1 })) as T[];
}

function hydrateEditablePhotos(images: RankedPhoto[]): EditablePhoto[] {
  return images.map((image) => ({
    ...image,
    edited_view_type: image.predicted_view_type,
    edited_tags: image.view_tags.join(", ")
  }));
}

export function RankingResultsClient({ rankingId }: RankingResultsClientProps) {
  const [job, setJob] = useState<RankingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<EditablePhoto[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [exported, setExported] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dragIndexRef = useRef<number | null>(null);

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

        if (nextJob.result && !dirty) {
          const nextPhotos = hydrateEditablePhotos(nextJob.result.ordered_images);
          setPhotos(nextPhotos);
          setSelectedPhotoId((current) =>
            current && nextPhotos.some((photo) => photo.image_id === current) ? current : nextPhotos[0]?.image_id ?? null
          );
        }

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
  }, [dirty, rankingId]);

  async function submitFeedback() {
    if (!job?.result) return;

    setSubmittingFeedback(true);
    setFeedbackStatus(null);

    const payload: FeedbackRequest = {
      ordered_asset_ids: photos.map((photo) => photo.image_id),
      corrected_labels: photos.map((photo) => ({
        image_id: photo.image_id,
        predicted_view_type: photo.edited_view_type as FeedbackRequest["corrected_labels"][number]["predicted_view_type"],
        view_tags: photo.edited_tags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      })),
      notes: notes || undefined,
      exported
    };

    try {
      const response = await fetch(`/api/v1/rankings/${rankingId}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error((await response.json()).error ?? "Unable to submit feedback.");
      }

      setFeedbackStatus("Feedback captured successfully.");
      setDirty(false);
    } catch (submitError) {
      setFeedbackStatus(submitError instanceof Error ? submitError.message : "Unable to submit feedback.");
    } finally {
      setSubmittingFeedback(false);
    }
  }

  function updatePhoto(imageId: string, patch: Partial<EditablePhoto>) {
    setPhotos((current) => current.map((photo) => (photo.image_id === imageId ? { ...photo, ...patch } : photo)));
    setDirty(true);
  }

  function moveSelectedPhoto(direction: -1 | 1) {
    const currentIndex = photos.findIndex((photo) => photo.image_id === selectedPhotoId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= photos.length) return;
    setPhotos((current) => reorder(current, currentIndex, nextIndex));
    setDirty(true);
  }

  const selectedPhoto = photos.find((photo) => photo.image_id === selectedPhotoId) ?? photos[0] ?? null;
  const selectedIndex = selectedPhoto ? photos.findIndex((photo) => photo.image_id === selectedPhoto.image_id) : -1;
  const feedbackState = dirty ? "Unsaved changes" : feedbackStatus ?? "Ready to capture feedback";
  const feedbackIsSuccess = !dirty && feedbackStatus?.includes("captured");
  const feedbackIsError = feedbackState.toLowerCase().includes("unable");

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

  if (!job) return null;

  return (
    <div className="results-shell">
      <section className="card results-summary">
        <div className="results-topbar">
          <div>
            <p className="results-meta">{job.ranking_id} · {job.method} · {job.status}</p>
            <h2 className="section-title">Review gallery</h2>
            <p className="helper-text" style={{ marginTop: 4 }}>Select a photo to edit labels, reorder, and save feedback.</p>
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

        {job.status === "failed" ? (
          <p className="status-text error">{job.error ?? "Ranking failed."}</p>
        ) : null}

        {job.status !== "completed" ? (
          <div className="alert-panel">
            <div className="status-dot status-dot-live" />
            <span>Still running — page polls automatically.</span>
          </div>
        ) : null}

        {job.result ? (
          <div className="summary-grid">
            <div className="summary-card">
              <span className="summary-label">Selected</span>
              <strong>{job.result.diagnostics.selected_asset_count}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">Duplicates</span>
              <strong>{job.result.diagnostics.duplicate_groups.length}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">Gaps</span>
              <strong>{job.result.diagnostics.missing_coverage.length}</strong>
            </div>
            <div className="summary-card">
              <span className="summary-label">Feedback</span>
              <strong style={{ fontSize: "1rem" }}>{dirty ? "Unsaved" : "Synced"}</strong>
            </div>
          </div>
        ) : null}

        {job.result?.diagnostics.missing_coverage.length ? (
          <div className="alert-panel alert-panel-warning">
            {job.result.diagnostics.missing_coverage.map((viewType) => (
              <span key={viewType} className="badge badge-outline">
                missing {formatLabel(viewType)}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {job.result ? (
        <section className="review-layout">
          <section className="card review-list">
            <div className="review-list-header">
              <div>
                <h3 className="section-title">Ordered gallery</h3>
                <p className="helper-text" style={{ marginTop: 2 }}>Click to select · drag to reorder</p>
              </div>
            </div>

            <div className="photo-list">
              {photos.map((photo, index) => (
                <article
                  key={photo.image_id}
                  className={`photo-row${selectedPhoto?.image_id === photo.image_id ? " is-active" : ""}`}
                  draggable
                  tabIndex={0}
                  onClick={() => setSelectedPhotoId(photo.image_id)}
                  onDragStart={() => { dragIndexRef.current = index; }}
                  onDragOver={(event) => { event.preventDefault(); }}
                  onDrop={() => {
                    if (dragIndexRef.current === null || dragIndexRef.current === index) return;
                    setPhotos((current) => reorder(current, dragIndexRef.current ?? index, index));
                    setDirty(true);
                    dragIndexRef.current = null;
                  }}
                >
                  <div className="photo-rank">#{index + 1}</div>
                  <div className="photo-thumb">
                    <img src={photo.preview_url} alt={photo.file_name} />
                  </div>

                  <div className="photo-content">
                    <h4 className="photo-name">{photo.file_name}</h4>

                    <div className="badge-row">
                      <span className="badge badge-secondary">{formatLabel(photo.predicted_view_type)}</span>
                      <span className="badge badge-outline">{formatScore(photo.confidence)}</span>
                      {photo.view_tags.slice(0, 1).map((tag) => (
                        <span key={tag} className="badge badge-outline">{tag}</span>
                      ))}
                    </div>

                    {photo.issues.length > 0 ? (
                      <div className="badge-row">
                        {photo.issues.slice(0, 2).map((issue) => (
                          <span key={issue} className="badge badge-destructive">{formatLabel(issue)}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="card editor-panel">
            {selectedPhoto ? (
              <div className="editor-stack">
                <div className="editor-preview">
                  <img src={selectedPhoto.preview_url} alt={selectedPhoto.file_name} />
                </div>

                <div className="editor-body">
                  <div className="editor-info">
                    <p className="helper-text">#{selectedIndex + 1} of {photos.length}</p>
                    <h3 className="editor-title">{selectedPhoto.file_name}</h3>
                    <p className="helper-text" style={{ marginTop: 4 }}>{selectedPhoto.rationale}</p>
                  </div>

                  <div className="editor-section">
                    <h4 className="editor-section-title">Scores</h4>
                    <div className="score-strip">
                      <span>Overall <strong>{formatScore(selectedPhoto.overall_score)}</strong></span>
                      <span>Hero <strong>{formatScore(selectedPhoto.hero_score)}</strong></span>
                      <span>Technical <strong>{formatScore(selectedPhoto.technical_quality_score)}</strong></span>
                    </div>
                  </div>

                  <div className="editor-section">
                    <h4 className="editor-section-title">Labels</h4>
                    <div className="field">
                      <label htmlFor={`${selectedPhoto.image_id}-view-type`}>View type</label>
                      <select
                        id={`${selectedPhoto.image_id}-view-type`}
                        value={selectedPhoto.edited_view_type}
                        onChange={(event) => updatePhoto(selectedPhoto.image_id, { edited_view_type: event.target.value })}
                      >
                        {VIEW_TYPES.map((viewType) => (
                          <option key={viewType} value={viewType}>{formatLabel(viewType)}</option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label htmlFor={`${selectedPhoto.image_id}-tags`}>Tags</label>
                      <input
                        id={`${selectedPhoto.image_id}-tags`}
                        value={selectedPhoto.edited_tags}
                        onChange={(event) => updatePhoto(selectedPhoto.image_id, { edited_tags: event.target.value })}
                        placeholder="comma, separated, tags"
                      />
                    </div>
                  </div>

                  <div className="editor-section">
                    <h4 className="editor-section-title">Sequence</h4>
                    <div className="button-row">
                      <button
                        className="button button-secondary button-sm"
                        type="button"
                        disabled={selectedIndex <= 0}
                        onClick={() => moveSelectedPhoto(-1)}
                      >
                        Move up
                      </button>
                      <button
                        className="button button-secondary button-sm"
                        type="button"
                        disabled={selectedIndex < 0 || selectedIndex >= photos.length - 1}
                        onClick={() => moveSelectedPhoto(1)}
                      >
                        Move down
                      </button>
                    </div>
                  </div>

                  <div className="editor-section">
                    <h4 className="editor-section-title">Feedback</h4>
                    <div className="field">
                      <label htmlFor="feedback-notes">Notes</label>
                      <textarea
                        id="feedback-notes"
                        rows={3}
                        value={notes}
                        onChange={(event) => {
                          setNotes(event.target.value);
                          setDirty(true);
                        }}
                        placeholder="Why did you change the order or labels?"
                      />
                    </div>

                    <label className="toggle-inline">
                      <input
                        type="checkbox"
                        checked={exported}
                        onChange={(event) => {
                          setExported(event.target.checked);
                          setDirty(true);
                        }}
                      />
                      Mark as exported or published
                    </label>

                    <div className="submit-area">
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={submittingFeedback}
                        onClick={() => void submitFeedback()}
                        style={{ width: "100%" }}
                      >
                        {submittingFeedback ? "Saving..." : "Save feedback"}
                      </button>
                      <p className={`status-text${feedbackIsSuccess ? " success" : ""}${feedbackIsError ? " error" : ""}`}>
                        {feedbackState}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <h3 className="section-title">No photo selected</h3>
                <p className="helper-text">Choose a photo from the list to edit labels and adjust sequence.</p>
              </div>
            )}
          </aside>
        </section>
      ) : null}
    </div>
  );
}
