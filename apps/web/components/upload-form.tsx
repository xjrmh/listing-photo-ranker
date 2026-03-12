"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { PropertyType } from "@listing-photo-ranker/core";

import { buildWebRankingRequest } from "../lib/ranking-request";

type UploadResponse = {
  files: Array<{
    asset_id: string;
    file_name: string;
    upload_url: string;
    headers: Record<string, string>;
  }>;
};

type RankingResponse = {
  ranking_id: string;
};

const MAX_VISIBLE_THUMBS = 6;

// Persists across client-side navigation within the same browser session
let _cachedFiles: File[] = [];

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as { error?: string };
      if (typeof payload.error === "string" && payload.error.trim()) {
        return payload.error;
      }
    } catch {
      // Ignore parse failures and fall through to the generic fallback.
    }
  }

  try {
    const text = (await response.text()).trim();
    if (text) {
      return text;
    }
  } catch {
    // Ignore body read failures and use the fallback below.
  }

  return fallback;
}

export function UploadForm() {
  const defaultTargetCount = 8;
  const router = useRouter();
  const [files, setFiles] = useState<File[]>(_cachedFiles);
  const [thumbUrls, setThumbUrls] = useState<string[]>([]);
  const [method, setMethod] = useState<"llm_judge" | "cv">("llm_judge");
  const [targetCount, setTargetCount] = useState(() =>
    _cachedFiles.length > 0 ? Math.min(defaultTargetCount, _cachedFiles.length) : defaultTargetCount
  );
  const [preferExteriorHero, setPreferExteriorHero] = useState(true);
  const [dedupe, setDedupe] = useState(true);
  const [requireRoomDiversity, setRequireRoomDiversity] = useState(true);
  const [propertyType, setPropertyType] = useState<PropertyType>("other");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const prevUrlsRef = useRef<string[]>([]);

  // Generate object URLs for thumbnail previews, revoke old ones on change
  useEffect(() => {
    prevUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    const urls = files.slice(0, MAX_VISIBLE_THUMBS).map((f) => URL.createObjectURL(f));
    prevUrlsRef.current = urls;
    setThumbUrls(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0) {
      setStatus("Choose at least one image before ranking.");
      return;
    }

    setSubmitting(true);
    setStatus("Creating upload targets...");

    try {
      const uploadResponse = await fetch("/api/v1/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          files: files.map((file) => ({
            file_name: file.name,
            content_type: file.type || "application/octet-stream",
            size_bytes: file.size
          }))
        })
      });

      if (!uploadResponse.ok) {
        throw new Error(await readErrorMessage(uploadResponse, "Failed to create upload targets."));
      }

      const uploadPayload = (await uploadResponse.json()) as UploadResponse;
      setStatus("Uploading images...");

      await Promise.all(
        uploadPayload.files.map(async (asset, index) => {
          const file = files[index];
          const headers = new Headers(asset.headers);
          if (!headers.has("content-type")) {
            headers.set("content-type", file.type || "application/octet-stream");
          }
          const response = await fetch(asset.upload_url, {
            method: "PUT",
            headers,
            body: file
          });
          if (!response.ok) {
            throw new Error(await readErrorMessage(response, `Failed to upload ${asset.file_name}.`));
          }
        })
      );

      setStatus("Queueing ranking job...");
      const rankingResponse = await fetch("/api/v1/rankings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildWebRankingRequest({
            method,
            targetCount: Math.min(targetCount, files.length),
            assetIds: uploadPayload.files.map((file) => file.asset_id),
            propertyType,
            policy: { preferExteriorHero, dedupe, requireRoomDiversity }
          })
        )
      });

      if (!rankingResponse.ok) {
        throw new Error(await readErrorMessage(rankingResponse, "Failed to queue ranking job."));
      }

      const rankingPayload = (await rankingResponse.json()) as RankingResponse;
      router.push(`/rankings/${rankingPayload.ranking_id}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
  }

  const remainingCount = Math.max(files.length - MAX_VISIBLE_THUMBS, 0);
  const isError = status.toLowerCase().includes("failed") || status.toLowerCase().includes("error") || status.toLowerCase().includes("choose");

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <div className="stack-sm">
        <h2 className="section-title">Upload photos</h2>
        <p className="helper-text">
          Add a gallery, choose your settings, and submit. Results appear on the review screen.
        </p>
      </div>

      <div className="upload-dropzone">
        <label htmlFor="photo-upload" className="dropzone-label">
          <input
            id="photo-upload"
            type="file"
            multiple
            accept="image/*"
            onChange={(event) => {
              const nextFiles = Array.from(event.target.files ?? []);
              _cachedFiles = nextFiles;
              setFiles(nextFiles);
              setTargetCount((current) => Math.min(Math.max(current, 1), Math.max(nextFiles.length, 1)));
              setStatus("");
            }}
          />
          <svg className="dropzone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span className="dropzone-title">
            {files.length === 0 ? "Drop photos here or click to browse" : "Replace selection"}
          </span>
          <span className="dropzone-copy">
            {files.length === 0
              ? "JPG, PNG, WEBP, or GIF · Ranking starts after upload"
              : `${files.length} photo${files.length === 1 ? "" : "s"} selected · click to change`}
          </span>
        </label>

        {thumbUrls.length > 0 && (
          <div className="thumb-strip">
            {thumbUrls.map((url, i) => (
              <div key={i} className="thumb-item">
                <img src={url} alt={files[i]?.name ?? `Photo ${i + 1}`} />
              </div>
            ))}
            {remainingCount > 0 && (
              <div className="thumb-item thumb-item-more">+{remainingCount}</div>
            )}
          </div>
        )}
      </div>

      <div className="control-grid">
        <div className="field">
          <label htmlFor="method">Ranking method</label>
          <select id="method" value={method} onChange={(event) => setMethod(event.target.value as "llm_judge" | "cv")}>
            <option value="llm_judge">LLM judge</option>
            <option value="cv">Computer vision</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="target-count">Photos to keep</label>
          <input
            id="target-count"
            type="number"
            min={1}
            max={Math.max(files.length, 1)}
            value={targetCount}
            onChange={(event) => setTargetCount(Number(event.target.value))}
          />
        </div>

        <div className="field">
          <label htmlFor="property-type">Property type</label>
          <select id="property-type" value={propertyType} onChange={(event) => setPropertyType(event.target.value as PropertyType)}>
            <option value="other">Generic listing</option>
            <option value="single_family">Single family</option>
            <option value="condo">Condo</option>
            <option value="townhouse">Townhouse</option>
            <option value="multi_family">Multi family</option>
          </select>
        </div>
      </div>

      <details className="advanced-settings">
        <summary>Advanced options</summary>
        <div className="toggle-grid">
          <label className="toggle-card">
            <input type="checkbox" checked={preferExteriorHero} onChange={(event) => setPreferExteriorHero(event.target.checked)} />
            <div>
              <strong>Prefer exterior hero</strong>
              <span>Bias the first position toward strong exterior coverage when available.</span>
            </div>
          </label>

          <label className="toggle-card">
            <input type="checkbox" checked={dedupe} onChange={(event) => setDedupe(event.target.checked)} />
            <div>
              <strong>Suppress near duplicates</strong>
              <span>Down-rank repeated angles and visually similar images.</span>
            </div>
          </label>

          <label className="toggle-card">
            <input
              type="checkbox"
              checked={requireRoomDiversity}
              onChange={(event) => setRequireRoomDiversity(event.target.checked)}
            />
            <div>
              <strong>Diversify early sequence</strong>
              <span>Spread room and view types near the top of the gallery.</span>
            </div>
          </label>
        </div>
      </details>

      <div className="submit-area">
        <button className="button button-primary" disabled={submitting} style={{ width: "100%" }}>
          {submitting ? "Submitting..." : "Create ranking"}
        </button>
        {status && (
          <p className={`status-text${isError ? " error" : ""}`}>{status}</p>
        )}
      </div>
    </form>
  );
}
