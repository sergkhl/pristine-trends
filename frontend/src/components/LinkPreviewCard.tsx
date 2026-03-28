import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

type Preview = Record<string, string | null> | null;

export function LinkPreviewCard({
  preview,
  href,
}: {
  preview: Preview;
  href?: string | null;
}) {
  if (!preview) return null;
  const title = preview.title ?? preview.siteName ?? "Link";
  const desc = preview.description;
  const img = preview.image;
  const safeHref = href?.startsWith("http") ? href : undefined;

  const inner = (
    <CardContent className="flex flex-row items-start gap-3 py-0">
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
