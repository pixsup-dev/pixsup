import { base44 } from "@/api/base44Client";
import { displayNameFor } from "@/lib/engagement";

// Fire-and-forget activity notification to a post's owner.
// Skipped when the actor is the owner themselves (no self-notifications).
export async function createNotification({ recipientId, type, postId, postTitle, actor, emoji }) {
  if (!recipientId || !actor || recipientId === actor.id) return;
  try {
    await base44.entities.Notification.create({
      recipient_id: recipientId,
      type,
      post_id: postId,
      post_title: postTitle || "Untitled",
      actor_name: displayNameFor(actor),
      ...(emoji ? { emoji } : {}),
    });
  } catch (e) {
    console.error(e);
  }
}