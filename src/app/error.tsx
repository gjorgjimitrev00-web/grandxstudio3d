'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page">
      <div className="empty">
        <h1 className="page-title">Мал прекин во студиото.</h1>
        <p>Не можеме да ја вчитаме страницата во моментов. / The page could not load.</p>
        <button className="button" onClick={reset}>
          Обиди се повторно / Try again
        </button>
      </div>
    </div>
  );
}
