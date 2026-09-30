import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { Bilingual } from "@/components/marketing/Bilingual";

export const metadata: Metadata = {
  title: "Terms of Service · Conditions d'utilisation",
  description: "The terms that govern your use of GarageOS. · Les conditions qui régissent votre utilisation de GarageOS.",
};

const H = "text-base font-semibold text-slate-900 mb-2";
const A = "font-semibold text-brand-blue hover:underline";

function English() {
  return (
    <>
      <PageHero eyebrow="Company" heading="Terms of Service" description="Last updated September 2026" />

      <section className="bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-8 text-slate-600 leading-relaxed text-sm">
          <div>
            <h2 className={H}>Using GarageOS</h2>
            <p>
              GarageOS is provided to help independent auto shops manage their operations, including appointments,
              customers and vehicles, estimates and approvals, work orders, inspections, invoicing, payments,
              communications, reminders and related shop-management workflows. By using GarageOS, your shop agrees
              to use it only for legitimate business purposes and to keep your account credentials secure.
            </p>
          </div>

          <div>
            <h2 className={H}>Subscription plans and pricing</h2>
            <p>
              GarageOS is offered in subscription plans with different included features, usage allowances, support
              levels and organizational capabilities. Current public pricing is shown on our <Link href="/pricing" className={A}>pricing page</Link>. Unless stated otherwise, public prices are in Canadian dollars (CAD) and applicable taxes are additional.
            </p>
            <p className="mt-3">
              Monthly plans are billed monthly. Annual plans are billed upfront for the annual term at the price shown
              when you subscribe. Any promotional pricing may be limited by time, eligibility or introductory period, and the
              regular renewal price will be disclosed with the offer. New accounts start with a 14-day free trial; a
              payment method is collected when you choose your plan and your first charge date and amount are shown
              before the trial begins.
            </p>
          </div>

          <div>
            <h2 className={H}>Plan features and usage</h2>
            <p>
              Access to some GarageOS capabilities may depend on your subscription plan. Core business records such
              as customers, vehicles, estimates, work orders, invoices and inspections are not intended to be priced
              by transaction count. Services with direct usage costs — such as SMS, storage or third-party
              services — may include plan allowances, fair-use limits or additional usage charges. Any applicable
              allowance or overage pricing will be disclosed before billing begins.
            </p>
          </div>

          <div>
            <h2 className={H}>Locations, users and add-ons</h2>
            <p>
              Plans may include different numbers of users or shop locations. Multi-location functionality,
              additional locations, data migration or other add-ons may carry separate fees
              as shown at the time of purchase. GarageOS will not charge a separate setup fee unless an optional paid
              onboarding, migration or custom service is clearly agreed to in advance.
            </p>
          </div>

          <div>
            <h2 className={H}>Feature availability</h2>
            <p>
              GarageOS evolves over time. Features described as coming soon, in development, beta or otherwise not
              generally available are not guaranteed to be available on a specific date. We may improve, replace or
              retire functionality as the product changes, while aiming to preserve the overall value of the plan
              you purchased.
            </p>
          </div>

          <div>
            <h2 className={H}>Your data</h2>
            <p>
              Your shop owns the client, vehicle, appointment, work and invoice data it enters into GarageOS. We only
              use it to provide the service to you, as described in our <Link href="/privacy" className={A}>Privacy Policy</Link>.
            </p>
          </div>

          <div>
            <h2 className={H}>Accounts</h2>
            <p>
              Shop owners are responsible for the team members they invite and the access levels they grant. You&apos;re
              responsible for activity that happens under your account.
            </p>
          </div>

          <div>
            <h2 className={H}>Availability</h2>
            <p>
              We work to keep GarageOS available and reliable, but the service is provided on an &quot;as is&quot;
              basis without guarantee of uninterrupted availability.
            </p>
          </div>

          <div>
            <h2 className={H}>Changes to these terms</h2>
            <p>We may update these terms as GarageOS evolves. We&apos;ll post changes on this page.</p>
          </div>

          <div>
            <h2 className={H}>Questions</h2>
            <p>Reach out through our <Link href="/contact" className={A}>contact page</Link> for anything related to these terms.</p>
          </div>
        </div>
      </section>
    </>
  );
}

function French() {
  return (
    <>
      <PageHero eyebrow="Entreprise" heading="Conditions d'utilisation" description="Dernière mise à jour : septembre 2026" />

      <section className="bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 space-y-8 text-slate-600 leading-relaxed text-sm">
          <div>
            <h2 className={H}>Utilisation de GarageOS</h2>
            <p>
              GarageOS est offert pour aider les ateliers de mécanique indépendants à gérer leurs opérations, notamment les
              rendez-vous, les clients et les véhicules, les soumissions et approbations, les bons de travail, les
              inspections, la facturation, les paiements, les communications, les rappels et les flux de travail connexes.
              En utilisant GarageOS, votre atelier s&apos;engage à l&apos;utiliser uniquement à des fins commerciales légitimes
              et à protéger les identifiants de son compte.
            </p>
          </div>

          <div>
            <h2 className={H}>Forfaits d&apos;abonnement et prix</h2>
            <p>
              GarageOS est offert en forfaits d&apos;abonnement comportant des fonctionnalités, des volumes d&apos;utilisation, des
              niveaux de soutien et des capacités organisationnelles différents. Les prix publics actuels figurent sur notre{" "}
              <Link href="/pricing" className={A}>page des tarifs</Link>. Sauf indication contraire, les prix publics sont en
              dollars canadiens (CAD) et les taxes applicables s&apos;ajoutent.
            </p>
            <p className="mt-3">
              Les forfaits mensuels sont facturés mensuellement. Les forfaits annuels sont facturés d&apos;avance pour la durée
              annuelle, au prix affiché au moment de l&apos;abonnement. Tout prix promotionnel peut être limité dans le temps, selon
              l&apos;admissibilité ou pour une période d&apos;introduction, et le prix de renouvellement régulier est indiqué avec
              l&apos;offre. Les nouveaux comptes bénéficient d&apos;un essai gratuit de 14 jours; un mode de paiement est recueilli
              lorsque vous choisissez votre forfait, et la date et le montant de votre premier paiement sont affichés avant le
              début de l&apos;essai.
            </p>
          </div>

          <div>
            <h2 className={H}>Fonctionnalités des forfaits et utilisation</h2>
            <p>
              L&apos;accès à certaines fonctionnalités de GarageOS peut dépendre de votre forfait. Les dossiers d&apos;affaires
              essentiels, tels que les clients, les véhicules, les soumissions, les bons de travail, les factures et les
              inspections, ne sont pas destinés à être tarifés selon le nombre de transactions. Les services entraînant des coûts
              directs d&apos;utilisation — comme les textos, le stockage ou les services de tiers — peuvent comporter des volumes
              inclus, des limites d&apos;utilisation raisonnable ou des frais d&apos;utilisation additionnels. Tout volume inclus ou
              tarif de dépassement applicable sera communiqué avant le début de la facturation.
            </p>
          </div>

          <div>
            <h2 className={H}>Emplacements, utilisateurs et options</h2>
            <p>
              Les forfaits peuvent inclure un nombre différent d&apos;utilisateurs ou d&apos;emplacements. La fonctionnalité
              multi-emplacements, les emplacements additionnels, la migration de données ou d&apos;autres options peuvent comporter
              des frais distincts, tels qu&apos;indiqués au moment de l&apos;achat. GarageOS n&apos;exigera pas de frais d&apos;installation
              distincts, sauf si un service optionnel payant d&apos;intégration, de migration ou sur mesure est clairement convenu à
              l&apos;avance.
            </p>
          </div>

          <div>
            <h2 className={H}>Disponibilité des fonctionnalités</h2>
            <p>
              GarageOS évolue avec le temps. Les fonctionnalités décrites comme « à venir », en développement, en version bêta ou
              autrement non offertes à tous ne sont pas garanties à une date précise. Nous pouvons améliorer, remplacer ou retirer
              des fonctionnalités au fil de l&apos;évolution du produit, tout en visant à préserver la valeur globale du forfait que
              vous avez acheté.
            </p>
          </div>

          <div>
            <h2 className={H}>Vos données</h2>
            <p>
              Votre atelier demeure propriétaire des données de clients, de véhicules, de rendez-vous, de travaux et de factures
              qu&apos;il saisit dans GarageOS. Nous les utilisons uniquement pour vous fournir le service, comme le décrit notre{" "}
              <Link href="/privacy" className={A}>politique de confidentialité</Link>.
            </p>
          </div>

          <div>
            <h2 className={H}>Comptes</h2>
            <p>
              Les propriétaires d&apos;atelier sont responsables des membres d&apos;équipe qu&apos;ils invitent et des niveaux d&apos;accès
              qu&apos;ils accordent. Vous êtes responsable de l&apos;activité qui survient sous votre compte.
            </p>
          </div>

          <div>
            <h2 className={H}>Disponibilité du service</h2>
            <p>
              Nous nous efforçons de maintenir GarageOS disponible et fiable, mais le service est fourni « tel quel », sans
              garantie de disponibilité ininterrompue.
            </p>
          </div>

          <div>
            <h2 className={H}>Modifications des conditions</h2>
            <p>Nous pouvons mettre à jour ces conditions à mesure que GarageOS évolue. Les changements seront publiés sur cette page.</p>
          </div>

          <div>
            <h2 className={H}>Questions</h2>
            <p>Pour toute question relative à ces conditions, écrivez-nous depuis notre <Link href="/contact" className={A}>page de contact</Link>.</p>
          </div>
        </div>
      </section>
    </>
  );
}

export default function TermsPage() {
  return (
    <MarketingPageShell>
      <Bilingual en={<English />} fr={<French />} />
    </MarketingPageShell>
  );
}
