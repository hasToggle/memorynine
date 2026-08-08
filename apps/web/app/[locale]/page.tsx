import type { Metadata } from "next";
import { Cta } from "./components/cta";
import { Erasure } from "./components/erasure";
import { Faqs } from "./components/faqs";
import { Footer } from "./components/footer";
import { Gate } from "./components/gate";
import { Hero } from "./components/hero";
import { Nav } from "./components/nav";
import { Pipeline } from "./components/pipeline";
import { Refusals } from "./components/refusals";

export const metadata: Metadata = {
  description:
    "memorynine turns calls, notes and forwarded mail into a company memory anyone can question. Every answer cites the fact or the raw source behind it, and nothing enters the record without a human confirming it.",
  title: "memorynine — nothing becomes knowledge until a human says so",
};

export default function LandingPage() {
  return (
    <div className="mn-surface">
      <Nav />
      <main>
        <Hero />
        <Pipeline />
        <Gate />
        <Refusals />
        <Erasure />
        <Faqs />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
