import { redirect } from 'next/navigation';

/** Eski tur adresi → oyun tur ekranı */
export default async function ArenaRoundRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/oyun/tur/${encodeURIComponent(id)}`);
}
