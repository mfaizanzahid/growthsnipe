import { Link, useParams } from "react-router-dom";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { BlogArt, CtaBand } from "../../components/marketing/MarketingBits";
import { usePageMeta } from "../../hooks/usePageMeta";
import { getPost } from "./blog-posts";

export function BlogPost() {
  const { slug } = useParams();
  const post = getPost(slug ?? "");
  usePageMeta(
    post
      ? { title: `${post.title} | GrowthSnipe Blog`, description: post.metaDescription }
      : { title: "", description: "" },
  );

  if (!post) {
    return (
      <MarketingLayout>
        <section className="mx-auto w-full max-w-3xl px-4 py-20 text-center">
          <BlogArt />
          <h1 className="mt-6 text-3xl font-bold tracking-tight">Post not found</h1>
          <p className="mt-3 text-muted-foreground">
            That post doesn't exist, or hasn't been written yet.
          </p>
          <Button className="mt-6" variant="outline" asChild>
            <Link to="/blog">Back to the blog</Link>
          </Button>
        </section>
      </MarketingLayout>
    );
  }

  return (
    <MarketingLayout>
      <article className="mx-auto w-full max-w-3xl px-4 py-14">
        <Link
          to="/blog"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeftIcon className="size-4" aria-hidden /> All posts
        </Link>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{post.pillar}</Badge>
          <span>{post.date}</span>
          <span>·</span>
          <span>{post.readMinutes} min read</span>
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{post.title}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{post.dek}</p>
        <div className="mt-10 space-y-8">
          {post.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-xl font-semibold tracking-tight">{s.heading}</h2>
              {s.paragraphs.map((para, i) => (
                <p key={i} className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {para}
                </p>
              ))}
            </section>
          ))}
        </div>
        {post.relatedLinks.length > 0 && (
          <nav aria-label="Keep reading" className="mt-10 rounded-xl border bg-muted/40 p-5">
            <h2 className="text-sm font-semibold">Keep reading</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {post.relatedLinks.map((l) => (
                <li key={l.to + l.label}>
                  <Link className="font-medium text-primary hover:underline" to={l.to}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </article>
      <CtaBand
        title="Put this into practice on your own numbers"
        body="Connect your software and get the briefing version of this post: built from your live data, every morning."
      />
    </MarketingLayout>
  );
}
