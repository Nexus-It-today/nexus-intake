import Link from "next/link";

const orderedStages = [
  "create",
  "review",
  "process",
  "dispatch",
  "track",
  "account",
] as const;

type Stage = (typeof orderedStages)[number];

type Props = {
  currentStage: Stage;
  orderStatus: string;
  nextRequiredAction: string;
};

const stageTitles: Record<Stage, string> = {
  create: "Create it",
  review: "Review it",
  process: "Process it",
  dispatch: "Dispatch it",
  track: "Track it",
  account: "Account it",
};

const stageLinks: Partial<Record<Stage, string>> = {
  create: "/app/create-it",
  process: "/process-it",
  track: "/track-it",
  account: "/account-it",
};

export default function WorkflowStageBanner({ currentStage, orderStatus, nextRequiredAction }: Props) {
  const currentIndex = orderedStages.indexOf(currentStage);
  const nextStage = orderedStages[currentIndex + 1] ?? null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Operational Workflow</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {orderedStages.map((stage, index) => (
              <span
                key={stage}
                className={
                  "rounded-full px-3 py-1 text-xs font-semibold " +
                  (index === currentIndex
                    ? "bg-blue-600 text-white"
                    : index < currentIndex
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500")
                }
              >
                {stageTitles[stage]}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Current Stage</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{stageTitles[currentStage]}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Next Stage</p>
          {nextStage ? (
            stageLinks[nextStage] ? (
              <Link href={stageLinks[nextStage]!} className="mt-1 inline-block text-sm font-semibold text-blue-600 underline-offset-2 hover:underline">
                {stageTitles[nextStage]}
              </Link>
            ) : (
              <p className="mt-1 text-sm font-semibold text-slate-900">{stageTitles[nextStage]}</p>
            )
          ) : (
            <p className="mt-1 text-sm font-semibold text-slate-900">Complete</p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Current Order Status</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{orderStatus}</p>
          <p className="mt-2 text-xs text-slate-600">Next required action: {nextRequiredAction}</p>
        </div>
      </div>
    </section>
  );
}
