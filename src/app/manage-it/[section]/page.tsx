import { notFound, redirect } from "next/navigation";
import { getManageItSection } from "@/lib/manageIt";

export default async function ManageItSectionRedirectPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const currentSection = getManageItSection(section);

  if (!currentSection) {
    notFound();
  }

  redirect(`/app/manage-it?section=${encodeURIComponent(currentSection.slug)}`);
}
