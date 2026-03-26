type Props = {
  score: number | null;
  status: string | null;
};

export function ScorePill({ score, status }: Props) {
  const label = score != null ? score.toFixed(1) : "—";
  const low = status === "low_quality";
  return (
    <span className={`score-pill ${low ? "score-pill--warn" : ""}`} title={status ?? undefined}>
      {label}
    </span>
  );
}
