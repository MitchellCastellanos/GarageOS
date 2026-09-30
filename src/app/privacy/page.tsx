import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { Bilingual } from "@/components/marketing/Bilingual";

export const metadata: Metadata = {
  title: "Privacy Policy · Politique de confidentialité",
  description: "How GarageOS collects, uses and protects your data. · Comment GarageOS recueille, utilise et protège vos données.",
};

const H = "text-base font-semibold text-slate-900 mb-2";
const A = "font-semibold text-brand-blue hover:underline";

function English() {
  return (
    <>
      <PageHero eyebrow="Company" heading="Privacy Policy" description="Last updated September 2026" />
      <section className="bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-8 text-slate-600 leading-relaxed text-sm">
          <div>
            <h2 className={H}>Information we collect</h2>
            <p>
              When you use GarageOS, we collect the information your shop provides to run the product — account
              details, shop information, and the client, vehicle, appointment and invoice records your shop enters.
              We also collect basic technical information (such as browser and device data) to keep the service
              secure and reliable.
            </p>
          </div>
          <div>
            <h2 className={H}>How we use it</h2>
            <p>
              We use this information to provide and improve GarageOS, to communicate with you about your account,
              and to send the appointment confirmations, estimates, invoices and reminders your shop sends to its
              own customers.
            </p>
          </div>
          <div>
            <h2 className={H}>Data separation between shops</h2>
            <p>
              Each shop&apos;s data is kept separate from every other shop using GarageOS. We do not share one
              shop&apos;s client or business data with another shop.
            </p>
          </div>
          <div>
            <h2 className={H}>Third parties</h2>
            <p>
              We use third-party providers for things like email delivery, SMS, payments and hosting, solely to operate
              GarageOS. We do not sell your data.
            </p>
          </div>
          <div>
            <h2 className={H}>Your choices</h2>
            <p>
              You can request access to, correction of, or deletion of your account&apos;s data at any time by
              contacting us.
            </p>
          </div>
          <div>
            <h2 className={H}>Changes to this policy</h2>
            <p>We may update this policy as GarageOS evolves. We&apos;ll post changes on this page.</p>
          </div>
          <div>
            <h2 className={H}>Questions</h2>
            <p>Reach out through our <Link href="/contact" className={A}>contact page</Link> for anything related to this policy.</p>
          </div>
        </div>
      </section>
    </>
  );
}

function French() {
  return (
    <>
      <PageHero eyebrow="Entreprise" heading="Politique de confidentialité" description="Dernière mise à jour : septembre 2026" />
      <section className="bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-8 text-slate-600 leading-relaxed text-sm">
          <div>
            <h2 className={H}>Renseignements que nous recueillons</h2>
            <p>
              Lorsque vous utilisez GarageOS, nous recueillons les renseignements que votre atelier fournit pour faire
              fonctionner le produit — coordonnées du compte, informations sur l&apos;atelier, ainsi que les dossiers de
              clients, de véhicules, de rendez-vous et de factures que votre atelier saisit. Nous recueillons aussi des
              données techniques de base (par exemple sur le navigateur et l&apos;appareil) afin de maintenir le service
              sécuritaire et fiable.
            </p>
          </div>
          <div>
            <h2 className={H}>Comment nous les utilisons</h2>
            <p>
              Nous utilisons ces renseignements pour fournir et améliorer GarageOS, pour communiquer avec vous au sujet
              de votre compte et pour envoyer les confirmations de rendez-vous, les soumissions, les factures et les
              rappels que votre atelier transmet à ses propres clients.
            </p>
          </div>
          <div>
            <h2 className={H}>Séparation des données entre ateliers</h2>
            <p>
              Les données de chaque atelier sont séparées de celles de tous les autres ateliers qui utilisent GarageOS.
              Nous ne communiquons pas les données de clients ou d&apos;affaires d&apos;un atelier à un autre atelier.
            </p>
          </div>
          <div>
            <h2 className={H}>Tiers</h2>
            <p>
              Nous faisons appel à des fournisseurs tiers pour, entre autres, l&apos;envoi de courriels et de textos, les
              paiements et l&apos;hébergement, uniquement pour exploiter GarageOS. Nous ne vendons pas vos données.
            </p>
          </div>
          <div>
            <h2 className={H}>Vos choix</h2>
            <p>
              Vous pouvez demander en tout temps l&apos;accès aux données de votre compte, leur rectification ou leur
              suppression en communiquant avec nous.
            </p>
          </div>
          <div>
            <h2 className={H}>Modifications de la politique</h2>
            <p>Nous pouvons mettre à jour cette politique à mesure que GarageOS évolue. Les changements seront publiés sur cette page.</p>
          </div>
          <div>
            <h2 className={H}>Questions</h2>
            <p>Pour toute question relative à cette politique, écrivez-nous depuis notre <Link href="/contact" className={A}>page de contact</Link>.</p>
          </div>
        </div>
      </section>
    </>
  );
}

export default function PrivacyPage() {
  return (
    <MarketingPageShell>
      <Bilingual en={<English />} fr={<French />} />
    </MarketingPageShell>
  );
}
