import { useEffect } from "react";

/** Sets document.title + meta description for marketing pages. No dependencies. */
export function usePageMeta({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    if (title) document.title = title;
    if (description) {
      let tag = document.querySelector('meta[name="description"]');
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", "description");
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", description);
    }
  }, [title, description]);
}
