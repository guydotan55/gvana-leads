import { WhatsAppSendError } from "@/lib/whatsapp/types";

describe("WhatsAppSendError", () => {
  it("formats provider + kind in the message", () => {
    const err = new WhatsAppSendError("wasender", "session_down", "WhatsApp Web unlinked");
    expect(err.message).toBe("[wasender/session_down] WhatsApp Web unlinked");
    expect(err.name).toBe("WhatsAppSendError");
    expect(err.provider).toBe("wasender");
    expect(err.kind).toBe("session_down");
  });

  it("carries optional status and upstreamBody", () => {
    const err = new WhatsAppSendError("infobip", "auth", "Invalid API key", 401, '{"requestError":...}');
    expect(err.status).toBe(401);
    expect(err.upstreamBody).toBe('{"requestError":...}');
  });
});
