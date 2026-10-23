import { useEffect } from 'react';
import { isActive, useImportJob } from '../api/collection';

/**
 * Live progress of one import. Calls `onFinished` once the job leaves the
 * queued/running states, so the shelf can reload what was imported.
 */
export function ImportProgress({
  importId,
  onFinished,
}: {
  importId: string;
  onFinished: () => void;
}) {
  const job = useImportJob(importId);
  const finished = job.data !== undefined && !isActive(job.data);

  useEffect(() => {
    if (finished) onFinished();
  }, [finished, onFinished]);

  if (job.data?.status === 'failed') {
    return (
      <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-800">
        Import failed: {job.data.error?.title ?? 'something went wrong'}.
      </p>
    );
  }

  const fetched = job.data?.progress?.fetched ?? 0;
  const total = job.data?.progress?.total;
  return (
    <div className="space-y-1" aria-live="polite">
      <p role="status">
        {total === undefined
          ? 'Importing your collection from Discogs…'
          : `Importing your collection from Discogs: ${fetched} of ${total} records`}
      </p>
      <progress
        className="w-full"
        aria-label="Import progress"
        max={total ?? 1}
        value={total === undefined ? undefined : fetched}
      />
    </div>
  );
}
