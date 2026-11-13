/** URL slug from free text: lower-case words joined by hyphens. */
export function slugify(text: string): string {
  return (
    text
      .normalize('NFKD')
      // Drop combining accents left by NFKD ("é" -> "e").
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120)
  );
}
