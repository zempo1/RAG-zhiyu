import { Body, Controller, Headers, Post, Res, HttpCode } from "@nestjs/common";
import type { Response } from "express";
import { ChatDto } from "./dto/chat.dto";
import { StreamChatDto } from "./dto/stream-chat.dto";
import { UserId } from "../auth/auth.guard";
import { errorMessage } from "../../common/api-error";
import { ChatWorkflowService, type PreparedChat } from "./chat-workflow.service";
import { ChatEventStream } from "./streaming/chat-event-stream";

@Controller("api")
export class ChatController {
  constructor(private readonly workflow: ChatWorkflowService) {}

  @Post("chat")
  @HttpCode(200)
  async answer(
    @Body() body: ChatDto,
    @UserId() user: number,
    @Headers("x-api-key") apiKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const abort = new AbortController();
    const closed = () => {
      if (!res.writableEnded) abort.abort(new Error("Client disconnected"));
    };
    res.on?.("close", closed);
    try {
      const response = await this.workflow.answer(body, user, apiKey, abort.signal);
      if (response.accepted) {
        res.status(202);
        return response.accepted;
      }
      return response.result;
    } finally {
      res.off?.("close", closed);
    }
  }

  @Post("stream-chat")
  async stream(
    @Body() body: StreamChatDto,
    @UserId() user: number,
    @Headers("x-api-key") apiKey: string | undefined,
    @Res() res: Response,
  ) {
    // Authorization errors must be returned before the SSE response starts.
    await this.workflow.preflightStream(body, user);
    const stream = new ChatEventStream(res);
    const status = (stage: string) => stream.notify({ stage }, "status");
    try {
      status("understanding");
      let prepared: PreparedChat;
      try {
        // Recheck quiz sources at admission after the preflight chat lookup.
        prepared = await this.workflow.prepare(
          body,
          user,
          apiKey,
          status,
          stream.abort.signal,
          (step) => stream.notify(step, "agent_step"),
          (task) => stream.notify(task, "task_started"),
        );
      } catch (error) {
        stream.notify({ message: errorMessage(error) }, "error");
        return;
      }
      if (prepared.accepted) {
        stream.notify(prepared.accepted, "accepted");
        return;
      }
      await this.workflow.stream(prepared, user, apiKey, stream.abort, (data, event) =>
        stream.send(data, event),
      );
    } finally {
      stream.close();
    }
  }
}
