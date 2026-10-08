/** Rota geçişlerinde üstte ince, belirsiz bir ilerleme çubuğu gösterir. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="min-h-[50vh]">
      <span className="sr-only">Sayfa yükleniyor…</span>
      <style href="pg-route-progress" precedence="default">
        {'@keyframes pg-route-progress{0%{transform:translateX(-100%) scaleX(.3)}50%{transform:translateX(30%) scaleX(.6)}100%{transform:translateX(110%) scaleX(.3)}}'}
      </style>
      <div aria-hidden="true" className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-brand-soft">
        <div className="h-full w-full origin-left bg-brand motion-safe:animate-[pg-route-progress_1.1s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}
