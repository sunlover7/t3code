import { ScheduledTaskId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { backgroundActivityTrigger, resolveUserMessagePresentation } from "./userMessage.ts";

describe("resolveUserMessagePresentation", () => {
  const legacyText = "[Triggered by schedule task: Daily audit]\n\nCheck for crashes.\n";

  it("removes attribution from legacy scheduled prompts", () => {
    expect(
      resolveUserMessagePresentation({ role: "user", createdBy: "agent", text: legacyText }),
    ).toEqual({
      text: "Check for crashes.\n",
      attribution: "automation",
      scheduledTaskId: undefined,
    });
  });

  it("uses task metadata without changing the prompt", () => {
    expect(
      resolveUserMessagePresentation({
        role: "user",
        createdBy: "agent",
        scheduledTaskId: ScheduledTaskId.make("task-1"),
        text: legacyText,
      }),
    ).toEqual({ text: legacyText, attribution: "automation", scheduledTaskId: "task-1" });
  });

  it("preserves user-written and assistant-quoted schedule headers", () => {
    for (const message of [
      { role: "user", createdBy: "user" as const },
      { role: "user" },
      { role: "assistant", createdBy: "agent" as const },
    ]) {
      expect(resolveUserMessagePresentation({ ...message, text: legacyText })).toEqual({
        text: legacyText,
        attribution: null,
        scheduledTaskId: undefined,
      });
    }
  });

  it("leaves other agent prompts and embedded headers intact", () => {
    for (const text of [
      "Review this area",
      `Quoted prompt:\n${legacyText}`,
      "[Triggered by schedule task: Daily audit]",
    ]) {
      expect(resolveUserMessagePresentation({ role: "user", createdBy: "agent", text })).toEqual({
        text,
        attribution: "agent",
        scheduledTaskId: undefined,
      });
    }
  });

  it("attributes older server-sent restart continuations to T3 Code, not another agent", () => {
    const text = "Note: the T3 server restarted.";
    expect(
      resolveUserMessagePresentation({
        role: "user",
        createdBy: "agent",
        creationSource: "server",
        text,
      }),
    ).toMatchObject({ attribution: "t3code" });
    for (const creationSource of ["mcp", "provider"] as const) {
      expect(
        resolveUserMessagePresentation({ role: "user", createdBy: "agent", creationSource, text }),
      ).toMatchObject({ attribution: "agent" });
    }
  });

  it("recovers the triggering automation from older scheduler message ids", () => {
    for (const trigger of ["scheduled", "manual"]) {
      expect(
        resolveUserMessagePresentation({
          id: `scheduled-task-message:task:daily-audit:1788661140000:${trigger}`,
          role: "user",
          createdBy: "user",
          text: legacyText,
        }),
      ).toEqual({
        text: "Check for crashes.\n",
        attribution: "automation",
        scheduledTaskId: "task:daily-audit",
      });
    }
  });

  it("labels server-generated user-role continuations without attributing them to the human", () => {
    expect(
      resolveUserMessagePresentation({
        role: "user",
        createdBy: "user",
        creationSource: "server",
        text: "Continue where you left off.",
      }).attribution,
    ).toBe("t3code");
  });

  it("folds only known mechanical triggers, never a human imitation or agent request", () => {
    const quota = {
      role: "user",
      id: "limit-resume:thread:run:reset",
      text: "Continue where you left off.",
    };
    expect(backgroundActivityTrigger({ ...quota, creationSource: "server" })).toBe(
      "Quota reset continuation",
    );
    for (const creationSource of ["web", "mobile", "mcp", "provider"] as const) {
      expect(backgroundActivityTrigger({ ...quota, creationSource })).toBeNull();
    }
    expect(
      backgroundActivityTrigger({
        role: "user",
        text: "Cont",
        createdBy: "user",
        creationSource: "mobile",
      }),
    ).toBeNull();
    expect(
      backgroundActivityTrigger({
        role: "user",
        text: "Approval needed",
        createdBy: "agent",
        creationSource: "mcp",
      }),
    ).toBeNull();
    expect(
      backgroundActivityTrigger({
        role: "user",
        text: "Failure needs attention",
        creationSource: "server",
      }),
    ).toBeNull();
    expect(
      backgroundActivityTrigger({ role: "assistant", text: "Pending.", createdBy: "agent" }),
    ).toBeNull();
    expect(
      backgroundActivityTrigger({
        role: "user",
        text: "Run audit",
        scheduledTaskId: ScheduledTaskId.make("audit"),
      }),
    ).toBe("Scheduled task");
    expect(
      backgroundActivityTrigger({
        role: "assistant",
        text: "Do not hide",
        scheduledTaskId: ScheduledTaskId.make("audit"),
      }),
    ).toBeNull();
  });
});
