import { redirect } from "next/navigation";

// The LIFF endpoint is the site root, so `liff.line.me/<LIFF_ID>` (no path) lands here.
// Send it to the summary page; deep links like /budgets are appended to the root by LIFF.
export default function HomePage() {
  redirect("/summary");
}
