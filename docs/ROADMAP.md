# Pixsup roadmap

What's planned, what to do before launch, and how Pixsup should change as it grows.
Last updated: October 10, 2026.

## 1. Before inviting people (launch checklist)

- [ ] **Admin → Settings → Fair reactions: ON.** It's off for testing (unlimited emoji time).
- [ ] **Admin → Settings → Points to trend: back toward 20.** It's 10 for testing.
- [ ] **Upgrade Supabase to Pro** ($25/month): more storage, daily backups, never pauses.
- [ ] **Legal details** on the Terms and Privacy pages: your name or company, and your state.
- [ ] **Vercel Pro** ($20/month) once Pixsup makes money. The free plan is for non-commercial use.
- [ ] Optional: tell Google about the site with Google Search Console.

## 2. Current settings (Admin → Settings)

| Setting | Now | Note |
|---|---|---|
| New posts live for | 120 min | Longer while the community is small |
| Each Hit adds | 10 min | |
| Each emoji adds | 5 min | |
| A comment adds | 15 min | |
| A save puts it back to | 60 min | A hit on someone else's post in its last 10 minutes. Trending posts too: another hour on the belt (switch: Trending saves) |
| A revive brings it back for | 60 min | 3 people in the 10 minutes after it dies |
| Points to trend | 10 | Raise as more people join |

As more people use Pixsup, tighten the times back toward 60 / 5 / 3 / 10. Short timers feel exciting when lots of people are online.

## 3. Before a big push (press, influencers, a big launch)

1. **Fair-exposure feed.** Every new post is shown to a small group first; if they engage, more people see it. This protects Pixsup's promise that good posts get their chance, instead of dying unseen in a busy feed.
2. **Automatic trending bar.** The points needed to trend rise with activity, so roughly the top few percent of posts trend whether there are 50 people or 50,000.
3. **Speed work:**
   - Live updates only for posts people can see, or grouped every few seconds. Today every hit is sent to every open screen.
   - Load the feed a page at a time instead of every live post at once.
   - Count "people here now" every 30 seconds instead of one live channel for everyone.
4. **Calmer reordering if needed.** If the ranked rows reshuffle too often with lots of people, update the order every few seconds instead of on every hit.

## 4. As Pixsup grows

- **A feed that feels personal:** blend in each person's Rescue Radar topics and their city. No following people; Pixsup stays about posts, topics and places.
- **Photo traffic:** smaller pictures in the feed (full size when opened) and a CDN cache.
- **Bigger database computer** at around 10,000 daily users.
- **AI checks on the paid plan** when the free limit runs out (a fraction of a cent per check).
- **Moderators:** a few trusted people on the Admin team to handle reports.

## 5. Later projects

- **App Store and Play Store apps.** Same accounts and posts as the website. Keep the rules in Admin settings so they change instantly without waiting for app review. Needs Apple's in-app purchases for paid boosts and Sign in with Apple.
- **Paid boosts** (built, switched off) once Stripe is set up.
- **AI check on news photos** (on hold).
