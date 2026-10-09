import React from "react";
import LegalPage from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what information Pixsup, operated by {LEGAL.operator}, collects, why,
        and the choices you have.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your email address, password (stored encrypted by our auth provider) and, if you use Google sign-in, your name from Google.</li>
        <li><strong>Profile:</strong> your username and when you accepted these policies.</li>
        <li><strong>Your content and activity:</strong> photos and videos you upload, titles, comments, hits, reactions, reports you make, people you block and posts you save.</li>
        <li><strong>Technical data:</strong> standard server logs (such as IP address and browser type) kept by our hosting providers for security and reliability.</li>
        <li><strong>Visit statistics:</strong> anonymous counts of page views, which pages are popular, the country and type of device. These use no cookies and can't identify you.</li>
      </ul>
      <p>
        Photos are resized before upload, which removes embedded metadata such as GPS location.
        We don't use advertising trackers or sell your personal information.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To run Pixsup: show posts, count engagement, send you notifications.</li>
        <li>To keep the community safe: automated checks of uploaded images, handling reports, and enforcing our Terms.</li>
        <li>To send account emails such as sign-up codes and password resets.</li>
      </ul>

      <h2>What other people see</h2>
      <p>
        Your posts, their titles and comments are public. Your username appears in notifications
        when you hit, react or comment. Your email address is never shown to other users. Reports
        you make are visible only to you and our moderators.
      </p>

      <h2>Service providers</h2>
      <p>We share data only with providers that help us run Pixsup:</p>
      <ul>
        <li>Supabase: database, authentication and file storage</li>
        <li>Vercel: website hosting and anonymous visit statistics</li>
        <li>Resend: account emails</li>
        <li>Google: optional sign-in</li>
        <li>An AI image-moderation provider, when enabled, to check uploaded images</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Posts are permanently deleted, with their files, about 7 days after they expire.</li>
        <li>Deleting your account (Settings → Delete Account) immediately and permanently removes your profile, posts, comments, hits, reactions, reports, blocks, saved posts and uploaded files.</li>
        <li>Backups and logs kept by our providers are deleted on their normal schedules.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can access and correct your information in the app, delete your account at any time,
        and contact us to request a copy of your data or ask questions. Depending on where you
        live (for example the EU, UK or California), you may have additional rights, and you can
        complain to your local data protection authority.
      </p>

      <h2>Children</h2>
      <p>
        Pixsup is not for children under 13. If we learn that a child under 13 has an account, we
        delete it. Contact us if you believe this has happened.
      </p>

      <h2>Changes</h2>
      <p>We'll post any changes here and update the effective date.</p>
    </LegalPage>
  );
}
