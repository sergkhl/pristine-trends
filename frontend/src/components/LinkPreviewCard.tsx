import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

type Preview = Record<string, string | null> | null;

function linkCardTitle(preview: Preview, safeHref: string | undefined): string {
  if (preview?.title) return preview.title;
  if (preview?.siteName) return preview.siteName;
  if (safeHref) {
    try {
      return new URL(safeHref).hostname;
    } catch {
      return "Link";
    }
  }
  return "Link";
}

export function LinkPreviewCard({
  preview,
  href,
  summary,
}: {
  preview: Preview;
  href?: string | null;
  summary?: string | null;
}) {
  const safeHref = href?.startsWith("http") ? href : undefined;
  if (!preview && !summary) return null;

  const title = linkCardTitle(preview, safeHref);
  const desc = preview?.description ?? null;
  const img = preview?.image ?? null;

  const inner = (
    <CardContent className="flex flex-col gap-2 py-0">
      <div className="flex flex-row items-start gap-3">
        {img ? (
          <img
            className="size-[4.5rem] shrink-0 rounded-none object-cover"
            src={img}
            alt=""
            loading="lazy"
          />
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-xs leading-snug">{title}</CardTitle>
          {desc ? (
            <CardDescription className="line-clamp-2 text-xs">{desc}</CardDescription>
          ) : null}
        </div>
      </div>
      {summary ? (
        <div className="border-border border-t pt-2">
          <p className="text-muted-foreground text-[0.65rem] font-semibold tracking-wide uppercase">
            Summary
          </p>
          <p className="mt-1 text-xs leading-relaxed">{summary}</p>
        </div>
      ) : null}
    </CardContent>
  );

  if (safeHref) {
    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-inherit no-underline"
      >
        <Card className="bg-muted/30 py-3 transition-colors hover:bg-muted/50">{inner}</Card>
      </a>
    );
  }

  return <Card className="bg-muted/30 py-3">{inner}</Card>;
}
