import { Shield } from "lucide-react";

export function PrivacyPolicy({ onClose }) {
  return (
    <div className="min-h-screen bg-[#020617] px-5 py-10 md:px-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">CollateralOS</div>
              <div className="text-xs text-slate-500">Privacy Policy</div>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
            >
              Back
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-sm leading-7 text-slate-300 space-y-6">
          <div>
            <h1 className="text-xl font-semibold text-white mb-1">Privacy Policy</h1>
            <p className="text-xs text-slate-500">Last updated: April 10, 2026</p>
          </div>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">1. Controller</h2>
            <p>
              CollateralOS (the "Platform") is operated as a treasury collateral management tool.
              The data controller responsible for personal data processed through this Platform is
              the institution that has deployed this system ("Institution"). For data protection
              enquiries, contact your Institution's Data Protection Officer.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">2. Data we process</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-white">Account data:</strong> name, professional email address, role.</li>
              <li><strong className="text-white">Session data:</strong> authentication tokens stored in secure httpOnly cookies (not accessible to browser scripts).</li>
              <li><strong className="text-white">Audit logs:</strong> records of actions taken within the Platform (user name, role, action, timestamp, object reference). Retained for 90 days.</li>
              <li><strong className="text-white">Financial data:</strong> collateral asset details, repo agreements, and counterparty information entered by authorised users.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">3. Legal basis (GDPR Art. 6)</h2>
            <p>
              Processing is carried out on the basis of <strong className="text-white">legitimate interests</strong> (Art. 6(1)(f)) — specifically, the Institution's operational need to manage collateral and repo obligations — and <strong className="text-white">compliance with legal obligations</strong> (Art. 6(1)(c)), including MiFID II, EMIR, and BNR regulatory requirements.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">4. Data retention</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Audit log entries are automatically purged after <strong className="text-white">90 days</strong>.</li>
              <li>User account data is retained for the duration of employment and deleted upon written request to the Institution's DPO.</li>
              <li>Financial transaction data may be retained longer to satisfy regulatory reporting obligations (MiFID II: 5 years, EMIR: 10 years).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">5. Your rights</h2>
            <p>Under GDPR you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-1">
              <li>Access personal data we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request erasure (subject to regulatory retention requirements).</li>
              <li>Object to processing based on legitimate interests.</li>
              <li>Lodge a complaint with the Romanian data protection authority (<strong className="text-white">ANSPDCP</strong>, anspdcp.eu).</li>
            </ul>
            <p className="mt-2">To exercise these rights, contact your Institution's DPO.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">6. Security measures</h2>
            <p>
              Authentication tokens are stored exclusively in <strong className="text-white">httpOnly, Secure, SameSite=Strict cookies</strong> — inaccessible to client-side scripts.
              All API communication uses HTTPS with HSTS. Access to sensitive endpoints is controlled by a server-side role-based permission system.
              Audit logs are server-generated and cannot be modified by users.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">7. Third-party services</h2>
            <p>
              The Platform frontend is hosted on Vercel (Vercel Inc., USA) under Standard Contractual Clauses.
              The API is hosted on Railway (Railway Corp., USA) under Standard Contractual Clauses.
              No personal data is shared with third-party analytics or advertising services.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">8. Changes</h2>
            <p>
              This policy may be updated to reflect changes in the Platform or legal requirements.
              Continued use after notification constitutes acceptance.
            </p>
          </section>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          CollateralOS · Romania Pilot · Banca Demo Romania
        </p>
      </div>
    </div>
  );
}
