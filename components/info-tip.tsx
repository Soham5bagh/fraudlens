export function Info({ text }: { text: string }) {
  if (!text) return null;
  return (
    <span className="info">
      <button
        type="button"
        className="info-btn"
        aria-label={text}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        i
      </button>
      <span className="info-tip" role="tooltip">{text}</span>
    </span>
  );
}
