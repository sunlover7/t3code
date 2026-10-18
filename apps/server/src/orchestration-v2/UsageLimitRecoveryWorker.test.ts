import { RunId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";
import type { ProjectionLimitRecoveryCandidate } from "./ProjectionStore.ts";
import { limitRecoveryCommand } from "./UsageLimitRecoveryWorker.ts";

const stoppedAt = "2026-10-18T10:00:00.000Z";
const resetAt = "2026-10-18T11:00:00.000Z";
const candidate: ProjectionLimitRecoveryCandidate = {
  id: ThreadId.make("quota-test"),
  status: "failed",
  lastErrorClass: "usage_limit",
  latestRunId: RunId.make("stopped-run"),
  usageLimitResetAt: resetAt,
  archivedAt: null,
  settledOverride: "active",
  pendingRuntimeRequest: null,
  latestRunCompletedAt: DateTime.makeUnsafe(stoppedAt),
  updatedAt: DateTime.makeUnsafe(stoppedAt),
  limitRecovery: null,
  snoozedUntil: null,
};

describe("bounded quota reset recovery", () => {
  it("does nothing when both controls are off, then arms a reset-bound recovery without a model dispatch", () => {
    expect(limitRecoveryCommand(candidate, false, Date.parse(stoppedAt))).toBeNull();
    const arm = limitRecoveryCommand(candidate, true, Date.parse(stoppedAt), true);
    expect(arm?.type).toBe("thread.metadata.update");
    if (arm?.type !== "thread.metadata.update") throw new Error("missing arm");
    expect(arm.limitRecovery).toMatchObject({
      runId: candidate.latestRunId,
      resetAt,
      autoResume: true,
      snooze: true,
    });
  });

  it("emits the same original run/reset identity at the reset, attributed to automation", () => {
    const armed = {
      ...candidate,
      limitRecovery: { runId: candidate.latestRunId!, resetAt, autoResume: true, snooze: true },
    };
    expect(limitRecoveryCommand(armed, true, Date.parse(resetAt) - 1)).toBeNull();
    const resume = limitRecoveryCommand(armed, true, Date.parse(resetAt));
    expect(resume).toMatchObject({
      type: "message.dispatch",
      createdBy: "agent",
      creationSource: "server",
      usageLimitContinuationOfRunId: candidate.latestRunId,
    });
    expect(resume?.commandId).toEqual(
      limitRecoveryCommand(armed, true, Date.parse(resetAt) + 1)?.commandId,
    );
  });

  it("holds closed threads, unknown/expired resets, nonquota failures and cancelled recovery", () => {
    const recovery = { runId: candidate.latestRunId!, resetAt, autoResume: true, snooze: false };
    for (const patch of [
      { archivedAt: DateTime.makeUnsafe(stoppedAt) },
      { settledOverride: "settled" as const },
      { usageLimitResetAt: null },
      { usageLimitResetAt: "invalid" },
      { usageLimitResetAt: stoppedAt },
      { lastErrorClass: "unknown" as const },
      { status: "completed" as const },
      { limitRecovery: { ...recovery, autoResume: false } },
    ])
      expect(
        limitRecoveryCommand(
          { ...candidate, limitRecovery: recovery, ...patch },
          true,
          Date.parse(resetAt),
        ),
      ).toBeNull();
  });
});
