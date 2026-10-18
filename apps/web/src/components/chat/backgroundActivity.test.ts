import { MessageId, RunId, ScheduledTaskId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  groupBackgroundActivityRows,
  computeStableMessagesTimelineRows,
  type MessagesTimelineRow,
} from "./MessagesTimeline.logic";

function message(
  id: string,
  role: "user" | "assistant",
  scheduled = false,
): Extract<MessagesTimelineRow, { kind: "message" }> {
  return {
    kind: "message",
    id,
    createdAt: "2026-10-18T00:00:00Z",
    message: {
      id: MessageId.make(id),
      role,
      text: role === "user" ? "Continue" : "Decision needed",
      runId: RunId.make(id),
      streaming: false,
      createdAt: "2026-10-18T00:00:00Z",
      updatedAt: "2026-10-18T00:00:00Z",
      ...(scheduled
        ? { scheduledTaskId: ScheduledTaskId.make("daily") }
        : { createdBy: "user" as const, creationSource: "mobile" as const }),
    },
    durationStart: "2026-10-18T00:00:00Z",
    showAssistantMeta: false,
    showAssistantCopyButton: false,
    assistantCopyStreaming: false,
  };
}

describe("background activity grouping", () => {
  it("folds adjacent automated prompts while retaining the exact original messages", () => {
    const first = message("one", "user", true);
    const second = message("two", "user", true);
    const rows = groupBackgroundActivityRows([first, second]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("background-activity");
    if (rows[0]?.kind !== "background-activity") throw new Error("missing group");
    expect(rows[0].messages).toEqual([first, second]);
    expect(rows[0].messages[0]).toBe(first);
    expect(rows[0].id).toBe(first.id);
  });

  it("never groups across an owner message, assistant decision/outcome or failure event", () => {
    const first = message("one", "user", true);
    const second = message("two", "user", true);
    for (const boundary of [
      message("owner", "user"),
      message("answer", "assistant"),
      {
        kind: "context-compaction" as const,
        id: "event",
        createdAt: "now",
        label: "event",
        active: false,
      },
    ]) {
      const rows = groupBackgroundActivityRows([first, boundary, second]);
      expect(rows.map((row) => row.kind)).toEqual([
        "background-activity",
        boundary.kind,
        "background-activity",
      ]);
      expect(rows[1]).toBe(boundary);
    }
  });

  it("preserves expansion identity on unchanged updates but refreshes changed or appended details", () => {
    const first = message("one", "user", true);
    const rows = groupBackgroundActivityRows([first]);
    const initial = computeStableMessagesTimelineRows(rows, { byId: new Map(), result: [] });
    expect(computeStableMessagesTimelineRows(groupBackgroundActivityRows([first]), initial)).toBe(
      initial,
    );
    const changed = { ...first, message: { ...first.message, text: "New exact details" } };
    const next = computeStableMessagesTimelineRows(groupBackgroundActivityRows([changed]), initial);
    expect(next.result[0]).not.toBe(initial.result[0]);
    const appended = groupBackgroundActivityRows([first, message("two", "user", true)]);
    expect(appended[0]?.id).toBe(rows[0]?.id);
    expect(computeStableMessagesTimelineRows(appended, initial).result[0]).not.toBe(
      initial.result[0],
    );
  });
});
