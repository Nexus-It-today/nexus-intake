import { redirect } from "next/navigation";

export default async function OrganisationDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/foundation-it/organisations/${id}`);
}
