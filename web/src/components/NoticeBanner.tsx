interface NoticeBannerProps {
  kind: 'ok' | 'err';
  text: string;
  onDismiss: () => void;
}

export default function NoticeBanner({ kind, text, onDismiss }: NoticeBannerProps) {
  const tone =
    kind === 'ok'
      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
      : 'bg-rose-500/10 border-rose-500/30 text-rose-400';

  return (
    <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${tone}`} role="status">
      <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={
            kind === 'ok'
              ? 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
              : 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z'
          }
        />
      </svg>
      <p className="text-sm font-medium flex-1">{text}</p>
      <button
        onClick={onDismiss}
        aria-label="إغلاق"
        className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
