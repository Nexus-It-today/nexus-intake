import { redirect } from "next/navigation";

export default async function MerchantDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/foundation-it/merchants/${id}`);
}
