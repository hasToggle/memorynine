import type { Metadata } from "next";
import { Cta } from "./components/cta";
import { Effort } from "./components/effort";
import { Erasure } from "./components/erasure";
import { Faqs } from "./components/faqs";
import { Footer } from "./components/footer";
import { Hero } from "./components/hero";
import { Hunting } from "./components/hunting";
import { Nav } from "./components/nav";
import { Refusals } from "./components/refusals";

export const metadata: Metadata = {
  description:
    "Talk for ninety seconds after a client call. memorynine turns it into something your whole team can ask — so nobody digs through Slack before a meeting, and nobody's knowledge leaves when they do.",
  title: "memorynine — walk into every client call already knowing",
};

export default function LandingPage() {
  return (
    <div className="mn-surface">
      <Nav />
      <main>
        <Hero />
        <Hunting />
        <Effort />
        <Refusals />
        <Erasure />
        <Faqs />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
