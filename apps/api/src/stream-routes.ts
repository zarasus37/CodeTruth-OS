import type { FastifyInstance } from "fastify";
import type { PipelineStreamEvent } from "@codetruth/core";
import { isStreamPubSubEnabled, subscribeStreamEvents } from "@codetruth/queue";
import { authenticate } from "./auth.js";
import { store } from "./context.js";
import { requireWorkspaceAccess } from "./rbac.js";

function sseWrite(reply: { raw: NodeJS.WritableStream }, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function registerStreamRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string }; Querystring: { access_token?: string } }>(
    "/analyses/:id/stream",
    async (request, reply) => {
      const queryToken = request.query.access_token?.trim();
      if (queryToken && !request.headers.authorization) {
        request.headers.authorization = `Bearer ${queryToken}`;
      }
      await authenticate(request, reply);
      if (reply.sent) return;
      const analysis = await store.getAnalysis(request.params.id);
      if (!analysis) return reply.code(404).send({ error: "Analysis not found" });

      const project = await store.getProject(analysis.projectId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const member = await requireWorkspaceAccess(request, reply, project.workspaceId, "report:view");
      if (!member) return;

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      let closed = false;
      let lastIndex = 0;
      const seen = new Set<string>();

      const push = (event: PipelineStreamEvent) => {
        const key = `${event.timestamp}:${event.stage}:${event.progress}`;
        if (seen.has(key)) return;
        seen.add(key);
        sseWrite(reply, "progress", event);
        if (event.stage === "completed" || event.stage === "failed") {
          sseWrite(reply, "done", { analysisId: analysis.id, status: event.stage });
        }
      };

      const poll = setInterval(async () => {
        if (closed) return;
        const latest = await store.getAnalysis(request.params.id);
        if (!latest) return;
        const events = latest.streamEvents ?? [];
        for (let i = lastIndex; i < events.length; i++) {
          push(events[i]!);
        }
        lastIndex = events.length;
        if (latest.status === "completed" || latest.status === "failed") {
          clearInterval(poll);
          if (!seen.has(`final:${latest.status}`)) {
            sseWrite(reply, "done", { analysisId: latest.id, status: latest.status });
          }
          reply.raw.end();
        }
      }, 800);

      let unsubscribe: (() => Promise<void>) | undefined;
      if (isStreamPubSubEnabled()) {
        unsubscribe = subscribeStreamEvents(request.params.id, push);
      }

      request.raw.on("close", () => {
        closed = true;
        clearInterval(poll);
        void unsubscribe?.();
      });
    },
  );
}