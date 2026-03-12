import { IntegrationGuide } from "../components/integration-guide";
import { UploadForm } from "../components/upload-form";

export default function HomePage() {
  return (
    <main className="app-shell">
      <nav className="site-nav">
        <span className="site-logo">Listing Photo Ranker</span>
        <div className="site-nav-links">
          <span className="badge badge-outline">Web UI</span>
          <span className="badge badge-outline">API</span>
          <span className="badge badge-outline">CLI</span>
        </div>
      </nav>

      <header className="page-hero">
        <h1 className="page-title">Rank listing photos with one click.</h1>
        <p className="page-subtitle">Upload a gallery, run the ranker, review the sequence, and capture feedback — all from one workspace.</p>
      </header>

      <section className="home-grid">
        <section className="card card-padded">
          <UploadForm />
        </section>
        <IntegrationGuide />
      </section>
    </main>
  );
}
