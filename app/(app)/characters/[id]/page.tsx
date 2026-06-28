// TODO(step #5): server shell — fetch the RLS-gated character row + rules JSON,
// then hand the data + version to the client editor.
export default async function CharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <div>Character {id} (TODO step #5)</div>;
}
