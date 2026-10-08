import React from "react";
import { Link } from "react-router-dom";
import LegalPage from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export default function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These Terms govern your use of Pixsup (the website at pixsup.com and the Pixsup apps),
        operated by {LEGAL.operator} ("we", "us"). By creating an account or using Pixsup you
        agree to these Terms and to our <Link to="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Who can use Pixsup</h2>
      <p>
        You must be at least 13 years old (or older if your country requires it) to create an
        account. If you are under 18, you confirm that a parent or guardian agrees to these Terms.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your login details secure. You're responsible for activity on your account.</li>
        <li>Your username must not impersonate others or be offensive.</li>
        <li>You can delete your account at any time in Settings. Deletion is permanent.</li>
      </ul>

      <h2>Zero tolerance for objectionable content</h2>
      <p>You may not post, comment or otherwise share content that:</p>
      <ul>
        <li>is sexually explicit, pornographic, or sexualizes minors in any way;</li>
        <li>harasses, bullies, threatens or encourages harm against anyone;</li>
        <li>is hateful toward people based on race, ethnicity, religion, gender, sexual orientation, disability or similar characteristics;</li>
        <li>shows graphic violence, gore, self-harm or illegal activity;</li>
        <li>is spam, a scam, or infringes someone else's copyright, trademark or privacy;</li>
        <li>shares someone's private information or images without their consent.</li>
      </ul>
      <p>
        We remove objectionable content and suspend or terminate accounts that post it, without
        notice. Uploaded images may be checked automatically before they appear.
      </p>

      <h2>Reporting and blocking</h2>
      <p>
        Use the ⋯ menu on any post to report it or block its author. Posts reported by several
        people are hidden automatically, and we review reports and act on them, normally within
        24 hours. Blocked members' posts are hidden from you and they can't send you notifications.
      </p>

      <h2>Your content</h2>
      <p>
        You keep ownership of what you post. You give us a worldwide, non-exclusive, royalty-free
        license to host, display and distribute it on Pixsup for as long as it is live. Posts are
        temporary: they leave the feed when their timer runs out and are permanently deleted
        about 7 days later. Only post content you have the right to share.
      </p>

      <h2>News content</h2>
      <p>
        News tiles show headlines and images from third-party publishers' public feeds and link to
        the original articles. That content belongs to its publishers; we don't endorse it.
      </p>

      <h2>Paid Boosts</h2>
      <p>
        Boosts are optional one-time purchases that add life to, or spotlight, one of your own
        posts. Payments are processed by Stripe. A Boost is used up as soon as it is applied, so it
        isn't refundable once it has started, except where the law requires otherwise. A Boost ends
        early if the post is removed for breaking these Terms, and it doesn't protect a post from
        moderation. If a payment goes through but the Boost isn't applied, contact us and we'll fix
        it or refund you.
      </p>

      <h2>Suspension and termination</h2>
      <p>
        We may suspend or terminate accounts that break these Terms, and may change or discontinue
        Pixsup at any time.
      </p>

      <h2>Disclaimers and liability</h2>
      <p>
        Pixsup is provided "as is" without warranties of any kind. To the fullest extent permitted
        by law, we are not liable for indirect or consequential damages, or for content posted by
        other users. Nothing in these Terms limits rights you have under consumer law that can't be
        limited.
      </p>

      <h2>Changes and governing law</h2>
      <p>
        We may update these Terms; if the changes are significant we'll let you know in the app.
        These Terms are governed by the laws of{" "}
        {LEGAL.governingLaw || "the place where the operator of Pixsup is based"}.
      </p>
    </LegalPage>
  );
}
