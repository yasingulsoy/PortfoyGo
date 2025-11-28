export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#181a20] text-white">
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-3">Gizlilik Politikası</h1>
          <p className="text-[#848e9c]">
            Kullanıcı verilerinizin güvenliği bizim için önemlidir. Aşağıdaki maddeler verilerinizi
            nasıl işlediğimizi açıklar.
          </p>
        </div>

        <section className="bg-[#1e2329] rounded-xl border border-[#2b3139] p-6 space-y-4">
          <h2 className="text-xl font-semibold">1. Toplanan Veriler</h2>
          <p className="text-sm text-[#c1c8d7] leading-relaxed">
            Kayıt sırasında paylaştığınız kullanıcı adı, e-posta ve portföy aktiviteleri platform
            içinde saklanır.
          </p>
        </section>

        <section className="bg-[#1e2329] rounded-xl border border-[#2b3139] p-6 space-y-4">
          <h2 className="text-xl font-semibold">2. Çerezler</h2>
          <p className="text-sm text-[#c1c8d7] leading-relaxed">
            Oturum yönetimi için tarayıcınıza çerez yerleştirebiliriz. Çerezler yalnızca kimlik
            doğrulama amacıyla kullanılır.
          </p>
        </section>

        <section className="bg-[#1e2329] rounded-xl border border-[#2b3139] p-6 space-y-4">
          <h2 className="text-xl font-semibold">3. İletişim</h2>
          <p className="text-sm text-[#c1c8d7] leading-relaxed">
            Gizlilikle ilgili sorularınız için support@sailkeep.com adresinden bize ulaşabilirsiniz.
          </p>
        </section>
      </div>
    </div>
  );
}

