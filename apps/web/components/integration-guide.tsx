import React from "react";

const API_SNIPPET = `POST /api/v1/uploads
POST /api/v1/rankings
GET  /api/v1/rankings/:id`;

const CLI_RANK_SNIPPET = `node packages/cli/bin/listing-photo-ranker.js rank \\
  ./photos --method llm_judge --top 8`;
const CLI_STATUS_SNIPPET = `node packages/cli/bin/listing-photo-ranker.js status <id>`;

export function IntegrationGuide() {
  return (
    <aside className="card guide-panel">
      <div className="stack-sm">
        <p className="section-kicker">Other paths</p>
        <h2 className="section-title">API &amp; CLI</h2>
        <p className="helper-text">
          The same upload, ranking, and feedback flow is available for automation and batch work.
        </p>
      </div>

      <div className="guide-stack">
        <section className="guide-card">
          <div className="guide-card-header">
            <span className="badge badge-secondary">API</span>
            <p className="small-text">Programmatic access to the ranking lifecycle.</p>
          </div>

          <ol className="step-list">
            <li>Create <code>.env.local</code></li>
            <li>Optionally set <code>API_KEY</code></li>
            <li>Run <code>npm run dev</code></li>
          </ol>

          <pre className="code-block"><code>{API_SNIPPET}</code></pre>
          <p className="small-text">Send <code>x-api-key</code> only when <code>API_KEY</code> is configured.</p>
        </section>

        <section className="guide-card">
          <div className="guide-card-header">
            <span className="badge badge-secondary">CLI</span>
            <p className="small-text">Thin HTTP client for local batches and operator workflows.</p>
          </div>

          <ol className="step-list">
            <li>Run <code>npm install</code></li>
            <li>Start the app with <code>npm run dev</code></li>
            <li>Run the CLI command from the repo root</li>
          </ol>

          <pre className="code-block"><code>{CLI_RANK_SNIPPET}</code></pre>
          <pre className="code-block code-block-secondary"><code>{CLI_STATUS_SNIPPET}</code></pre>
          <p className="small-text">Optional flags: <code>--api-base-url</code> and <code>--api-key</code>.</p>
        </section>
      </div>

      <p className="guide-footer">See the README for environment setup, examples, and deeper API details.</p>
    </aside>
  );
}
