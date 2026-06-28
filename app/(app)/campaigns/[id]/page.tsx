// TODO(step #7): campaign view — GM sees members' characters; players see their own.
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <div>Campaign {id} (TODO step #7)</div>;
}
