import React from "react";
import { useId } from "react";

import type { AppRuntimeMode } from "@listing-photo-ranker/core";

type GuideMode = "api" | "cli";

const STATEFUL_API_SNIPPET = `POST /api/v1/uploads
POST /api/v1/rankings
GET  /api/v1/rankings/:id`;

const STATEFUL_CLI_RANK_SNIPPET = `node packages/cli/bin/listing-photo-ranker.js rank \\
  ./photos --method llm_judge --top 8`;
const STATEFUL_CLI_STATUS_SNIPPET = `node packages/cli/bin/listing-photo-ranker.js status <id>`;

const STATELESS_API_SNIPPET = `POST /api/v1/rankings/sync
Content-Type: multipart/form-data`;

const STATELESS_CLI_RANK_SNIPPET = `node packages/cli/bin/listing-photo-ranker.js rank \\
  ./photos --sync --method llm_judge --top 8`;
const STATELESS_CLI_EXPORT_SNIPPET = `node packages/cli/bin/listing-photo-ranker.js rank \\
  ./photos --sync --json > ranking.json`;

export function IntegrationGuide({
  initialMode = "api",
  runtimeMode = "stateful"
}: {
  initialMode?: GuideMode;
  runtimeMode?: AppRuntimeMode;
}) {
  const id = useId();
  const inputName = `guide-mode-${id}`;
  const apiId = `guide-mode-api-${id}`;
  const cliId = `guide-mode-cli-${id}`;
  const isStateless = runtimeMode === "stateless";

  return (
    <aside className="card guide-panel">
      <div className="stack-sm">
        <p className="section-kicker">Other paths</p>
        <h2 className="section-title">API &amp; CLI</h2>
        <p className="helper-text">
          {isStateless
            ? "Stateless mode ranks everything in one request and keeps review edits client-side."
            : "The same upload, ranking, and feedback flow is available for automation and batch work."}
        </p>
      </div>

      <input
        id={apiId}
        className="guide-toggle-input"
        type="radio"
        name={inputName}
        defaultChecked={initialMode === "api"}
      />
      <input
        id={cliId}
        className="guide-toggle-input"
        type="radio"
        name={inputName}
        defaultChecked={initialMode === "cli"}
      />

      <div className="guide-toggle" role="radiogroup" aria-label="Switch between API and CLI instructions">
        <label htmlFor={apiId} className="guide-toggle-button">
          API
        </label>
        <label htmlFor={cliId} className="guide-toggle-button">
          CLI
        </label>
      </div>

      <section className="guide-card guide-card-api" aria-label="API instructions">
        <div className="guide-card-header">
          <span className="badge badge-secondary">API</span>
          <p className="small-text">
            {isStateless
              ? "One-shot multipart ranking without persisted jobs or result pages."
              : "Programmatic access to the ranking lifecycle."}
          </p>
        </div>

        <ol className="step-list">
          <li>Create <code>.env.local</code></li>
          <li>Optionally set <code>API_KEY</code></li>
          <li>{isStateless ? <>POST files directly to <code>/api/v1/rankings/sync</code></> : <>Run <code>npm run dev</code></>}</li>
        </ol>

        <pre className="code-block"><code>{isStateless ? STATELESS_API_SNIPPET : STATEFUL_API_SNIPPET}</code></pre>
        <p className="small-text">
          {isStateless
            ? <>Send images as repeated <code>files</code> parts plus ranking options in the same multipart request.</>
            : <>External API and CLI clients should send <code>x-api-key</code> when <code>API_KEY</code> is configured.</>}
        </p>
      </section>

      <section className="guide-card guide-card-cli" aria-label="CLI instructions">
        <div className="guide-card-header">
          <span className="badge badge-secondary">CLI</span>
          <p className="small-text">
            {isStateless
              ? "One-shot CLI flow that returns the final ranking immediately."
              : "Thin HTTP client for local batches and operator workflows."}
          </p>
        </div>

        <ol className="step-list">
          <li>Run <code>npm install</code></li>
          <li>Start the app with <code>npm run dev</code></li>
          <li>Run the CLI command from the repo root</li>
        </ol>

        <pre className="code-block guide-cli-command"><code>{isStateless ? STATELESS_CLI_RANK_SNIPPET : STATEFUL_CLI_RANK_SNIPPET}</code></pre>
        <pre className="code-block code-block-secondary guide-cli-command"><code>{isStateless ? STATELESS_CLI_EXPORT_SNIPPET : STATEFUL_CLI_STATUS_SNIPPET}</code></pre>
        <p className="small-text">
          {isStateless
            ? <>In stateless mode, use <code>--sync</code>. The <code>status</code> and <code>feedback</code> commands remain stateful-only.</>
            : <>Optional flags: <code>--api-base-url</code> and <code>--api-key</code>.</>}
        </p>
      </section>

      <p className="guide-footer">See the README for environment setup, examples, and deeper API details.</p>
    </aside>
  );
}
