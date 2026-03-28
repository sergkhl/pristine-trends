import { Badge } from "@/components/ui/badge";

type Props = {
  score: number | null;
  status: string | null;
};

export function ScorePill({ score, status }: Props) {
  const label = score != null ? score.toFixed(1) : "—";
  const low = status === "low_quality";
  return (
    <Badge variant={low ? "destructive" : "secondary"} title={status ?? undefined}>
      {label}
    </Badge>
  );
}
