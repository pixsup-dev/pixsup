import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const fileUrl = typeof body.file_url === "string" ? body.file_url.trim() : "";
    if (!fileUrl) {
      return Response.json({ error: "file_url is required" }, { status: 400 });
    }

    const analysis = {
      safe: true,
      reason: "Local dev bypass",
      category: "All",
      hashtags: ["#local", "#test", "#pixsup"],
      title: "Uploaded Image",
      emojis: ["📸", "✨"]
    };

    return Response.json(analysis);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}