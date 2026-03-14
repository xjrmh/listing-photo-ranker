"use client";

import React from "react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import {
  VIEW_TYPES,
  type FeedbackRequest,
  type PhotoCriteria,
  type RankedPhoto,
  type RankingResult
} from "@listing-photo-ranker/core/client";

type EditablePhoto = RankedPhoto & {
  edited_view_type: string;
  edited_tags: string;
  preview_url: string;
};

type RankingReviewWorkspaceProps = {
  result: RankingResult;
  headerMeta: string;
  title?: string;
  subtitle?: string;
  warningMessage?: string | null;
  actions?: ReactNode;
  feedbackActionLabel: string;
  feedbackPendingLabel: string;
  idleFeedbackMessage?: string;
  previewUrlByImageId?: Record<string, string>;
  onSubmitFeedback: (payload: FeedbackRequest) => Promise<string>;
};

function formatLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function formatScore(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatPriority(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const CRITERIA_ORDER: Array<keyof PhotoCriteria> = [
  "lighting_exposure",
  "sharpness_clarity",
  "perspective_straightness",
  "composition_framing",
  "space_representation",
  "declutter_staging",
  "feature_highlighting",
  "hero_potential"
];

function reorder<T extends { position: number }>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((item, index) => ({ ...item, position: index + 1 })) as T[];
}

function hydrateEditablePhotos(images: RankedPhoto[], previewUrlByImageId?: Record<string, string>): EditablePhoto[] {
  return images.map((image) => ({
    ...image,
    preview_url: previewUrlByImageId?.[image.image_id] ?? image.preview_url ?? "",
    edited_view_type: image.predicted_view_type,
    edited_tags: image.view_tags.join(", ")
  }));
}

export function RankingReviewWorkspace({
  result,
  headerMeta,
  title = "Review gallery",
  subtitle = "Select a photo to edit labels, reorder, and save feedback.",
  warningMessage,
  actions,
  feedbackActionLabel,
  feedbackPendingLabel,
  idleFeedbackMessage = "Ready to capture feedback",
  previewUrlByImageId,
  onSubmitFeedback
}: RankingReviewWorkspaceProps) {
  const [photos, setPhotos] = useState<EditablePhoto[]>(() => hydrateEditablePhotos(result.ordered_images, previewUrlByImageId));
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(photos[0]?.image_id ?? null);
  const [notes, setNotes] = useState("");
  const [exported, setExported] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"success" | "error" | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dragIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (dirty) {
      return;
    }

    const nextPhotos = hydrateEditablePhotos(result.ordered_images, previewUrlByImageId);
    setPhotos(nextPhotos);
    setSelectedPhotoId((current) =>
      current && nextPhotos.some((photo) => photo.image_id === current) ? current : nextPhotos[0]?.image_id ?? null
    );
  }, [dirty, previewUrlByImageId, result]);

  async function submitFeedback() {
    setSubmittingFeedback(true);
    setFeedbackMessage(null);
    setFeedbackTone(null);

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
      const message = await onSubmitFeedback(payload);
      setFeedbackMessage(message);
      setFeedbackTone("success");
      setDirty(false);
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : "Unable to submit feedback.");
      setFeedbackTone("error");
    } finally {
      setSubmittingFeedback(false);
    }
  }

  function updatePhoto(imageId: string, patch: Partial<EditablePhoto>) {
    setPhotos((current) => current.map((photo) => (photo.image_id === imageId ? { ...photo, ...patch } : photo)));
    setDirty(true);
    setFeedbackTone(null);
  }

  function moveSelectedPhoto(direction: -1 | 1) {
    const currentIndex = photos.findIndex((photo) => photo.image_id === selectedPhotoId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= photos.length) return;
    setPhotos((current) => reorder(current, currentIndex, nextIndex));
    setDirty(true);
    setFeedbackTone(null);
  }

  const selectedPhoto = photos.find((photo) => photo.image_id === selectedPhotoId) ?? photos[0] ?? null;
  const selectedIndex = selectedPhoto ? photos.findIndex((photo) => photo.image_id === selectedPhoto.image_id) : -1;
  const feedbackState = dirty ? "Unsaved changes" : feedbackMessage ?? idleFeedbackMessage;
  const feedbackIsSuccess = !dirty && feedbackTone === "success";
  const feedbackIsError = feedbackTone === "error";

  return (
    <div className="results-shell">
      <section className="card results-summary">
        <div className="results-topbar">
          <div>
            <p className="results-meta">{headerMeta}</p>
            <h2 className="section-title">{title}</h2>
            <p className="helper-text" style={{ marginTop: 4 }}>{subtitle}</p>
          </div>

          {actions ? <div className="button-row">{actions}</div> : null}
        </div>

        {warningMessage ? (
          <p className="status-text error">{warningMessage}</p>
        ) : null}

        <div className="summary-grid">
          <div className="summary-card">
            <span className="summary-label">Selected</span>
            <strong>{result.diagnostics.selected_asset_count}</strong>
          </div>
          <div className="summary-card">
            <span className="summary-label">Duplicates</span>
            <strong>{result.diagnostics.duplicate_groups.length}</strong>
          </div>
          <div className="summary-card">
            <span className="summary-label">Gaps</span>
            <strong>{result.diagnostics.missing_coverage.length}</strong>
          </div>
          <div className="summary-card">
            <span className="summary-label">Feedback</span>
            <strong style={{ fontSize: "1rem" }}>{dirty ? "Unsaved" : "Ready"}</strong>
          </div>
        </div>

        {result.diagnostics.missing_coverage.length ? (
          <div className="alert-panel alert-panel-warning">
            {result.diagnostics.missing_coverage.map((viewType) => (
              <span key={viewType} className="badge badge-outline">
                missing {formatLabel(viewType)}
              </span>
            ))}
          </div>
        ) : null}

        <div className="card action-plan-card">
          <div className="stack-sm">
            <div>
              <h3 className="section-title">Action plan</h3>
              <p className="helper-text" style={{ marginTop: 4 }}>{result.gallery_feedback.summary}</p>
            </div>

            {result.gallery_feedback.actionable_items.length > 0 ? (
              <div className="action-list">
                {result.gallery_feedback.actionable_items.map((item) => (
                  <article key={`${item.title}-${item.how_to_fix}`} className="action-item">
                    <div className="action-item-topline">
                      <strong>{item.title}</strong>
                      <span className="badge badge-secondary">{formatPriority(item.priority)}</span>
                    </div>
                    <p className="helper-text">{item.why}</p>
                    <p className="action-item-fix">{item.how_to_fix}</p>
                    {item.affected_image_ids.length > 0 ? (
                      <div className="badge-row">
                        {item.affected_image_ids.slice(0, 4).map((imageId) => (
                          <span key={imageId} className="badge badge-outline">{imageId}</span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}

            {(result.gallery_feedback.strengths.length > 0 || result.gallery_feedback.weaknesses.length > 0) ? (
              <div className="summary-grid-compact">
                <div className="summary-card">
                  <span className="summary-label">Strengths</span>
                  <strong style={{ fontSize: "1rem" }}>{result.gallery_feedback.strengths.length}</strong>
                  <p className="helper-text" style={{ marginTop: 8 }}>
                    {result.gallery_feedback.strengths.slice(0, 2).join(" ")}
                  </p>
                </div>
                <div className="summary-card">
                  <span className="summary-label">Weaknesses</span>
                  <strong style={{ fontSize: "1rem" }}>{result.gallery_feedback.weaknesses.length}</strong>
                  <p className="helper-text" style={{ marginTop: 8 }}>
                    {result.gallery_feedback.weaknesses.slice(0, 2).join(" ")}
                  </p>
                </div>
                <div className="summary-card">
                  <span className="summary-label">Action Items</span>
                  <strong style={{ fontSize: "1rem" }}>{result.gallery_feedback.actionable_items.length}</strong>
                  <p className="helper-text" style={{ marginTop: 8 }}>
                    Prioritized coaching generated from the selected gallery.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

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
                  setFeedbackTone(null);
                  dragIndexRef.current = null;
                }}
              >
                <div className="photo-rank">#{index + 1}</div>
                <div className="photo-thumb">
                  <img src={photo.preview_url || undefined} alt={photo.file_name} />
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
                <img src={selectedPhoto.preview_url || undefined} alt={selectedPhoto.file_name} />
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
                  <h4 className="editor-section-title">Criteria</h4>
                  <div className="criteria-grid">
                    {CRITERIA_ORDER.map((criterion) => (
                      <div key={criterion} className="criteria-row">
                        <span>{formatLabel(criterion)}</span>
                        <strong>{formatScore(selectedPhoto.criteria[criterion])}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="editor-section">
                  <h4 className="editor-section-title">Retake Advice</h4>
                  {selectedPhoto.improvement_actions.length > 0 ? (
                    <div className="action-list action-list-compact">
                      {selectedPhoto.improvement_actions.map((item) => (
                        <article key={`${item.issue}-${item.action}`} className="action-item">
                          <div className="action-item-topline">
                            <strong>{formatLabel(item.issue)}</strong>
                            <span className="badge badge-secondary">{formatPriority(item.priority)}</span>
                          </div>
                          <p className="action-item-fix">{item.action}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="helper-text">No immediate retake actions were generated for this image.</p>
                  )}
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
                        setFeedbackTone(null);
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
                        setFeedbackTone(null);
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
                      {submittingFeedback ? feedbackPendingLabel : feedbackActionLabel}
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
    </div>
  );
}
