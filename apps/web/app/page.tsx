import { resolveAppRuntimeMode } from "@listing-photo-ranker/core";

import { GitHubLink } from "../components/github-link";
import { IntegrationGuide } from "../components/integration-guide";
import { UploadForm } from "../components/upload-form";

export default function HomePage() {
  const runtimeMode = resolveAppRuntimeMode();

  return (
    <main className="app-shell">
      <nav className="site-nav">
        <span className="site-logo">Listing Photo Ranker</span>
        <div className="site-nav-actions">
          <div className="site-nav-links">
            <span className="badge badge-outline">Web UI</span>
            <span className="badge badge-outline">API</span>
            <span className="badge badge-outline">CLI</span>
          </div>
          <GitHubLink />
        </div>
      </nav>

      <header className="page-hero">
        <h1 className="page-title">Rank listing photos with one click.</h1>
        <p className="page-subtitle">Upload a gallery, run the ranker, review the sequence, and capture results.</p>
      </header>

      <section className="home-grid">
        <UploadForm runtimeMode={runtimeMode} />
        <IntegrationGuide runtimeMode={runtimeMode} />
      </section>

      <footer className="app-footer">Powered by FlatRE.ai</footer>
    </main>
  );
}
