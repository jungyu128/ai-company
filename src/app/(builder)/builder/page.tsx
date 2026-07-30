import { redirect } from "next/navigation";

/** Primary AI Company entry → Headquarters */
export default function BuilderIndexPage() {
  redirect("/builder/hq");
}
