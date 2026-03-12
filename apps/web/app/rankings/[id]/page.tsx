import Link from "next/link";

import { GitHubLink } from "../../../components/github-link";
import { RankingResultsClient } from "../../../components/ranking-results-client";

export default async function RankingPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

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
      <RankingResultsClient rankingId={params.id} />
      <footer className="app-footer">Powered by FlatRE.ai</footer>
    </main>
  );
}
