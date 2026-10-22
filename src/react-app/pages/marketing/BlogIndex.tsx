import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { BlogArt, PageHero } from "../../components/marketing/MarketingBits";
import { POSTS } from "./blog-posts";

const PILLARS = ["All", ...Array.from(new Set(POSTS.map((p) => p.pillar)))];

export function BlogIndex() {
  const [pillar, setPillar] = useState("All");
  const visible = pillar === "All" ? POSTS : POSTS.filter((p) => p.pillar === pillar);
  return (
    <MarketingLayout>
      <PageHero
        eyebrow="Blog"
        title="Straight talk for people who run home service businesses."
        lede="No AI hype, no jargon: deep insights, decision-making habits, and data-backed actions drawn from 15 years inside this industry."
      />
      <section className="mx-auto w-full max-w-6xl px-4 pb-6">
        <BlogArt />
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {PILLARS.map((name) => (
            <Button
              key={name}
              size="sm"
              variant={pillar === name ? "default" : "outline"}
              onClick={() => setPillar(name)}
            >
              {name}
            </Button>
          ))}
        </div>
      </section>
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-14 md:grid-cols-2">
        {visible.map((p) => (
          <Card key={p.slug} className="flex flex-col">
            <CardHeader>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{p.pillar}</Badge>
                <span>{p.date}</span>
                <span>·</span>
                <span>{p.readMinutes} min read</span>
              </div>
              <CardTitle className="text-xl">{p.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              <CardDescription>{p.dek}</CardDescription>
              <Link
                to={`/blog/${p.slug}`}
                className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-primary hover:underline"
              >
                Read the post <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </MarketingLayout>
  );
}
