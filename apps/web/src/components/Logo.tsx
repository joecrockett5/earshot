/** The Earshot mark: the listener, two range rings, and one sound on the outer ring. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="4.5" fill="currentColor" />
      <circle cx="32" cy="32" r="14" stroke="currentColor" strokeWidth="4" />
      <path
        d="M55.93 21.84A26 26 0 1 1 42.16 8.07"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="50.38" cy="13.62" r="5.25" fill="var(--accent)" />
    </svg>
  );
}
