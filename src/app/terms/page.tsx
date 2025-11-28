export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#181a20] text-white">
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-3">Kullanım Şartları</h1>
          <p className="text-[#848e9c]">
            SailKeep platformunu kullanarak aşağıdaki şartları kabul etmiş olursunuz.
          </p>
        </div>

        <section className="bg-[#1e2329] rounded-xl border border-[#2b3139] p-6 space-y-4">
          <h2 className="text-xl font-semibold">1. Genel Kullanım</h2>
          <p className="text-sm text-[#c1c8d7] leading-relaxed">
            Bu platform yalnızca eğitim amaçlıdır. Gerçek yatırım tavsiyesi niteliğinde değildir.
            Hesabınızla yaptığınız tüm işlemlerden siz sorumlusunuz.
          </p>
        </section>

        <section className="bg-[#1e2329] rounded-xl border border-[#2b3139] p-6 space-y-4">
          <h2 className="text-xl font-semibold">2. Veri Güvenliği</h2>
          <p className="text-sm text-[#c1c8d7] leading-relaxed">
            Hesap bilgileriniz güvenlik amaçlı saklanır. Şifrenizi kimseyle paylaşmamanız önerilir.
          </p>
        </section>

        <section className="bg-[#1e2329] rounded-xl border border-[#2b3139] p-6 space-y-4">
          <h2 className="text-xl font-semibold">3. Güncellemeler</h2>
          <p className="text-sm text-[#c1c8d7] leading-relaxed">
            Şartları zaman zaman güncelleme hakkımız saklıdır. Güncellemeleri takip etmek
            kullanıcı sorumluluğundadır.
          </p>
        </section>
      </div>
    </div>
  );
}

