import Link from "next/link";

import { GitHubLink } from "../../../components/github-link";
import { StatelessResultsClient } from "../../../components/stateless-results-client";

export default function StatelessRankingPage() {
  return (
    <main className="app-shell">
      <nav className="site-nav">
        <span className="site-logo">Listing Photo Ranker</span>
        <div className="site-nav-actions">
          <Link href="/" className="button button-ghost button-sm">
            ← Back to upload
          </Link>
          <GitHubLink />
        </div>
      </nav>
      <StatelessResultsClient />
      <footer className="app-footer">Powered by FlatRE.ai</footer>
    </main>
  );
}
