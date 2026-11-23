import type { Response } from "express";
import { once } from "node:events";

export class ChatEventStream {
  readonly abort = new AbortController();
  private readonly heartbeat: NodeJS.Timeout;

  constructor(private readonly response: Response) {
    response.status(200).set({
      "Content-Type": "text/event-stream;charset=UTF-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();
    response.on("close", this.onClose);
    this.heartbeat = setInterval(() => {
      if (this.writable && !response.writableNeedDrain) response.write(": heartbeat\n\n");
    }, 15000);
    this.heartbeat.unref();
  }

  private get writable() {
    return !this.response.destroyed && !this.response.writableEnded;
  }

  private readonly onClose = () => this.abort.abort(new Error("Client disconnected"));

  private frame(data: unknown, event?: string) {
    return (event ? "event: " + event + "\n" : "") + "data: " + JSON.stringify(data) + "\n\n";
  }

  notify(data: unknown, event: string) {
    if (this.writable) this.response.write(this.frame(data, event));
  }

  async send(data: unknown, event?: string) {
    const { signal } = this.abort;
    if (!this.writable || (signal.aborted && event !== "error")) return;
    if (!this.response.write(this.frame(data, event)) && !signal.aborted)
      await once(this.response, "drain", { signal });
  }

  close() {
    clearInterval(this.heartbeat);
    this.response.off("close", this.onClose);
    if (this.writable) this.response.end();
  }
}
