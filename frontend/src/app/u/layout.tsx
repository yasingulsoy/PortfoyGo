// Herkese açık profiller (/u/**): oyun kitinin avatar paleti, çerçeve ve kademe renkleri için oyun derisi
// token'ları gerekir. Sayfa uygulama (TailAdmin) düzeninde kalır; [data-skin="game"] yalnızca avatar / kademe
// rozetini saran öğelerde kullanılır. Harici font / görsel / betik kaynağı yoktur (CSP değişikliği gerekmez).
import '../oyun/game.css';

export default function PublicProfilesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
