import type { RankingResult } from "@listing-photo-ranker/core/client";

type StatelessRankingSession = {
  files: File[];
  result: RankingResult;
};

let cachedUploadFiles: File[] = [];
let statelessRankingSession: StatelessRankingSession | null = null;

export function getCachedUploadFiles(): File[] {
  return [...cachedUploadFiles];
}

export function setCachedUploadFiles(files: File[]): void {
  cachedUploadFiles = [...files];
}

export function getStatelessRankingSession(): StatelessRankingSession | null {
  if (!statelessRankingSession) {
    return null;
  }

  return {
    files: [...statelessRankingSession.files],
    result: statelessRankingSession.result
  };
}

export function setStatelessRankingSession(files: File[], result: RankingResult): void {
  statelessRankingSession = {
    files: [...files],
    result
  };
}

export function clearStatelessRankingSession(): void {
  statelessRankingSession = null;
}
