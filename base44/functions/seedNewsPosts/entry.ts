import { createClientFromRequest } from "@base44/sdk";

export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);

  const mockNewsFeed = [
    {
      title: "SpaceX Prepares Starship for Next Orbital Test",
      media_url: "https://images.unsplash.com/photo-1517976487192-5750f6348632?w=800",
      thumbnail_url: "https://images.unsplash.com/photo-1517976487192-5750f6348632?w=800",
      category: "news",
      hashtags: ["news", "All", "Tech"],
      guest_author_id: "TechCrunch",
      hits: 14
    },
    {
      title: "New Breakthrough in Quantum Computing Efficiency",
      media_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800",
      thumbnail_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800",
      category: "news",
      hashtags: ["news", "All", "Science"],
      guest_author_id: "Wired",
      hits: 8
    },
    {
      title: "Global Markets Surge Following Tech Sector Earnings",
      media_url: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
      thumbnail_url: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800",
      category: "news",
      hashtags: ["news", "All", "Finance"],
      guest_author_id: "Bloomberg",
      hits: 19
    }
  ];

  for (const item of mockNewsFeed) {
    await base44.entities.Post.create(item);
  }

  return Response.json({ success: true, seeded: mockNewsFeed.length });
}