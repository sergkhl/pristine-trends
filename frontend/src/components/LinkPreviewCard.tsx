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
    <>
      {img ? <img className="link-preview__img" src={img} alt="" loading="lazy" /> : null}
      <div className="link-preview__body">
        <span className="link-preview__title">{title}</span>
        {desc ? <span className="link-preview__desc">{desc}</span> : null}
      </div>
    </>
  );

  if (safeHref) {
    return (
      <a className="link-preview" href={safeHref} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }

  return <div className="link-preview link-preview--static">{inner}</div>;
}
