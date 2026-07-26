export function BloomMark({ className }: { className?: string }) {
  return (
    <img
      aria-hidden="true"
      alt=""
      className={className ? `bloom-mark ${className}` : "bloom-mark"}
      src="/icon.svg"
    />
  );
}
