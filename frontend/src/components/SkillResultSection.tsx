"use client";

import { useId, useState } from "react";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";

type FactCheckVerdict =
  | "TRUE"
  | "MOSTLY_TRUE"
  | "MIXED"
  | "MOSTLY_FALSE"
  | "FALSE"
  | "UNVERIFIABLE";

interface FactCheckClaim {
  claim: string;
  verdict: FactCheckVerdict;
  confidence: number;
  analysis: string;
  sources: string[];
}

interface FactCheckResult {
  claims: FactCheckClaim[];
  overall_verdict: string;
}

const VERDICT_COLORS: Record<
  string,
  { variant: "default" | "destructive" | "secondary" | "outline"; label: string; className?: string }
> = {
  TRUE: {
    variant: "default",
    label: "True",
    className: "bg-emerald-600 text-white",
  },
  MOSTLY_TRUE: {
    variant: "default",
    label: "Mostly True",
    className: "bg-emerald-700 text-white",
  },
  MIXED: {
    variant: "outline",
    label: "Mixed",
    className: "bg-amber-700 text-white",
  },
  MOSTLY_FALSE: {
    variant: "destructive",
    label: "Mostly False",
  },
  FALSE: {
    variant: "destructive",
    label: "False",
  },
  UNVERIFIABLE: {
    variant: "secondary",
    label: "Unverifiable",
  },
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const style = VERDICT_COLORS[verdict] ?? VERDICT_COLORS.UNVERIFIABLE;
  return (
    <Badge
      variant={style.variant}
      className={`capitalize ${style.className || ""}`}
    >
      {style.label}
    </Badge>
  );
}

function FactCheckSkillRenderer({ result }: { result: FactCheckResult }) {
  const [expanded, setExpanded] = useState(false);
  const claimsListId = useId();

  if (!result || !result.overall_verdict) return null;

  const claims = result.claims ?? [];
  const hasClaims = claims.length > 0;

  const rowContent = (
    <>
      <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
        Fact check
      </span>
      <VerdictBadge verdict={result.overall_verdict} />
      {hasClaims ? (
        <span className="ml-auto flex items-center gap-1 text-muted-foreground text-xs">
          {expanded ? "Hide details" : `${claims.length} claim${claims.length > 1 ? "s" : ""}`}
          {expanded ? (
            <CaretDownIcon weight="bold" className="size-3 shrink-0" />
          ) : (
            <CaretRightIcon weight="bold" className="size-3 shrink-0" />
          )}
        </span>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-2">
      {hasClaims ? (
        <button
          type="button"
          className="-mx-3 flex w-[calc(100%+1.5rem)] cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-controls={claimsListId}
        >
          {rowContent}
        </button>
      ) : (
        <div className="flex items-center gap-2 py-1">{rowContent}</div>
      )}

      {expanded && hasClaims && (
        <ul id={claimsListId} className="m-0 flex flex-col gap-3 p-0">
          {[...claims]
            .sort((a, b) => {
              const order = [
                "UNVERIFIABLE",
                "FALSE",
                "MOSTLY_FALSE",
                "MIXED",
                "MOSTLY_TRUE",
                "TRUE",
              ];
              return order.indexOf(a.verdict) - order.indexOf(b.verdict);
            })
            .map((claim, i) => (
            <li key={i} className="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <VerdictBadge verdict={claim.verdict} />
                <span
                  className="text-muted-foreground shrink-0 text-[0.65rem] tabular-nums"
                  title="Confidence"
                >
                  {(claim.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <p className="m-0 font-medium leading-relaxed">{claim.claim}</p>
              {claim.analysis && (
                <p className="m-0 leading-relaxed text-muted-foreground">{claim.analysis}</p>
              )}
              {claim.sources.length > 0 && (
                <ul className="m-0 flex flex-col gap-0.5 p-0">
                  {claim.sources.map((s, j) => (
                    <li key={j} className="text-muted-foreground text-[0.65rem] before:me-1 before:content-['→'] before:text-[0.6rem]">
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type SkillResults = Record<string, unknown> | null;

interface SkillResultSectionProps {
  skillResults: SkillResults;
}

export function SkillResultSection({ skillResults }: SkillResultSectionProps) {
  if (!skillResults || typeof skillResults !== "object" || Object.keys(skillResults).length === 0) {
    return null;
  }

  const skillEntries = Object.entries(skillResults);

  return (
    <div className="flex flex-col gap-3">
      {skillEntries.map(([skillName, result]) => {
        if (!result || typeof result !== "object") return null;

        switch (skillName) {
          case "fact_checker":
            return (
              <div key={skillName} className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <FactCheckSkillRenderer result={result as FactCheckResult} />
              </div>
            );
          default:
            // Generic fallback for future skills
            return (
              <div key={skillName} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-muted-foreground uppercase tracking-wide">
                    {skillName.replace(/_/g, " ")}
                  </span>
                </div>
                <pre className="text-[10px] text-muted-foreground overflow-auto max-h-32 whitespace-pre-wrap">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            );
        }
      })}
    </div>
  );
}
