import { redirect } from 'next/navigation';

/** Eski meydan okuma adresi → oyun meydan okuma ekranı */
export default async function ArenaChallengeRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/oyun/meydan-okuma/${encodeURIComponent(id)}`);
}
