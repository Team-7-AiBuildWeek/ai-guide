/**
 * The marketing side of the product: landing, cities, planner. Its stylesheet
 * is imported here rather than globally, so the tour player at /walk keeps its
 * own design system untouched.
 */

import "./site.css";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
