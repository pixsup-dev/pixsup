import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { LEGAL } from "@/lib/legal";

// Shared layout for the Terms and Privacy pages: readable on phones, linked
// from sign-up, onboarding, Settings and the app store listings.
export default function LegalPage({ title, children }) {
  return (
    <main className="min-h-screen bg-[#0b0f17] px-4 py-8 text-gray-200">
      <article className="mx-auto max-w-2xl space-y-4 text-sm leading-relaxed [&_h2]:pt-4 [&_h2]:text-base [&_h2]:font-extrabold [&_h2]:text-cyan-300 [&_li]:ml-5 [&_li]:list-disc [&_a]:text-cyan-300 [&_a]:underline">
        <Link to="/" className="inline-flex items-center gap-1 text-xs font-bold text-gray-400 no-underline hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Pixsup
        </Link>
        <h1 className="text-2xl font-black text-white">{title}</h1>
        <p className="text-xs text-gray-500">Effective {LEGAL.effectiveDate}</p>
        {children}
        <h2>Contact</h2>
        <p>
          Questions? Email <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
        </p>
      </article>
    </main>
  );
}
