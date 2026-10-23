import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { isActive, useImportJob } from '../api/collection';

/** A count that springs up to each new value, so progress reads as records arriving. */
function useTicking(target: number): number {
  const [shown, setShown] = useState(target);
  // Where the count currently stands, so a new target continues from there.
  const current = useRef(target);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const controls = animate(current.current, target, {
      type: 'spring',
      stiffness: 120,
      damping: 24,
      onUpdate: (v) => {
        current.current = v;
        setShown(Math.round(v));
      },
    });
    return () => {
      controls.stop();
    };
  }, [target, reduce]);

  // With reduced motion the count simply shows the real number.
  return reduce ? target : shown;
}

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
  const fetched = useTicking(job.data?.progress?.fetched ?? 0);
  const total = job.data?.progress?.total;

  useEffect(() => {
    if (finished) onFinished();
  }, [finished, onFinished]);

  if (job.data?.status === 'failed') {
    return (
      <p role="alert" className="text-sm leading-relaxed">
        The import stopped: {job.data.error?.title ?? 'something went wrong'}.
      </p>
    );
  }

  const real = job.data?.progress?.fetched ?? 0;
  return (
    <div className="space-y-2">
      {/* Screen readers get the real count once per poll, not every animation frame. */}
      <p role="status" className="sr-only">
        {total === undefined
          ? 'Bringing your collection in from Discogs…'
          : `Importing your collection from Discogs: ${String(real)} of ${String(total)} records`}
      </p>
      <p aria-hidden="true" className="numerals flex items-baseline gap-2 text-sm">
        {total === undefined ? (
          'Bringing your collection in from Discogs…'
        ) : (
          <>
            <span className="text-2xl font-bold [font-stretch:78%]">{fetched}</span>
            <span>of {total} records in from Discogs</span>
          </>
        )}
      </p>
      <progress
        aria-label="Import progress"
        max={total ?? 1}
        value={total === undefined ? undefined : real}
        className="h-1 w-full appearance-none overflow-hidden [&::-moz-progress-bar]:bg-sticker [&::-webkit-progress-bar]:bg-rule [&::-webkit-progress-value]:bg-sticker"
      />
    </div>
  );
}
