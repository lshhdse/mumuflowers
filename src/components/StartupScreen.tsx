import type { ReactNode } from 'react';

export function StartupScreen({ children }: { children?: ReactNode }) {
  return (
    <div className="startup-screen">
      <svg
        className="startup-flower"
        width="108"
        height="108"
        viewBox="0 0 108 108"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M54 24c-5 0-8 5-8 12s3 13 8 13 8-6 8-13-3-12-8-12ZM35 34c-4 2-3 8 2 13s10 7 13 4c4-3 2-9-2-14-5-5-10-6-13-3ZM72 34c-4-3-9-2-14 3-4 5-6 11-2 14 3 3 8 1 13-4s6-11 3-13ZM35 55c-4 3-3 8 2 12s11 5 14 2c3-4 0-9-5-12-5-4-9-5-11-2ZM73 55c-3-3-7-2-12 2-5 3-8 8-5 12 3 3 9 2 14-2s6-9 3-12ZM54 55c-5 0-8 6-8 12 0 7 3 12 8 12s8-5 8-12c0-6-3-12-8-12Z"
        />
        <circle fill="#D5BA78" cx="54" cy="51" r="8" />
        <path
          fill="#9AAE8D"
          d="M52 74h4v17h-4ZM54 86c-12 0-18-7-18-12 12 0 18 6 18 12ZM54 86c12 0 18-7 18-12-12 0-18 6-18 12Z"
        />
      </svg>
      <div className="startup-wordmark">
        <b>MuMu Flowers</b>
        <span>好好生活，慢慢生长</span>
      </div>
      {children && (
        <div className="startup-message" role="status">
          {children}
        </div>
      )}
    </div>
  );
}
