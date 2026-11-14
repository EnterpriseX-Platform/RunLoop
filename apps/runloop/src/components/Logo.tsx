import React from 'react';

// RunLoop mark: a square loop that runs clockwise from a start node and
// comes back on itself with an arrowhead, drawn on a 24px grid with
// square caps to match Carbon's geometry. Uses currentColor.
export function LogoMark({ size = 20, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d="M5 11V5h14v14h-8" stroke="currentColor" strokeWidth={2.5} strokeLinecap="square" />
      <path d="M11 15.5 7 19l4 3.5z" fill="currentColor" />
      <rect x="3" y="12" width="4" height="4" fill="currentColor" />
    </svg>
  );
}
