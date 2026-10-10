import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageShell } from "@/components/marketing/MarketingPageShell";
import { PageHero } from "@/components/marketing/PageHero";
import { GroupedResourceCards } from "@/components/marketing/ResourceArticles";
import { GUIDES } from "@/lib/marketing-resources";
import { Bilingual } from "@/components/marketing/Bilingual";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  path: "/help",
  title: "Help Center · Centre d'aide",
  description: "Answers to common questions about GarageOS.",
});

const FAQS = [
  {
    q: "What is GarageOS?",
    a: "GarageOS is management software for independent auto shops — booking, inspections, estimates and approvals, Work Orders, invoicing, reminders, a customer portal and customer communication, all in one place.",
  },
  {
    q: "How do I get started?",
    a: "Create an account, confirm your email, choose your plan and add a payment method to start the 14-day free trial — you pay $0 today. Then follow the Quick Start checklist to set up your shop and invite your team.",
  },
  {
    q: "How does the free trial work?",
    a: "You choose Core, Pro or Complete and add a payment method during setup. Nothing is charged for 14 days; we show the exact date and amount of your first charge, and your subscription starts automatically afterwards. You can cancel from Billing before the trial ends.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes. Manage your plan and payment method from Settings → Billing. Features that need a higher plan show what's required, and existing data is kept.",
  },
  {
    q: "Do customers get a portal?",
    a: "Yes, on every plan. Open a customer and email them a secure link to see their vehicles, appointments, estimates, invoices and service history. Links expire after 30 days and you can revoke them at any time.",
  },
  {
    q: "Can I run more than one location?",
    a: "Yes, with the Complete plan (Multi-Shop): add locations under one organization, switch between them and see consolidated or per-location reports. Each location keeps its own customers, work and invoices.",
  },
  {
    q: "Can customers book appointments online?",
    a: "Yes — each shop gets its own branded booking page where customers can request an appointment directly.",
  },
  {
    q: "Is my shop's data separated from other shops?",
    a: "Yes. Each shop's clients, vehicles, appointments and invoices are scoped to that shop only.",
  },
  {
    q: "Why are there no times available on the booking page?",
    a: "Check that online booking is enabled, the shop is open that day and at least one mechanic is available for bookings. The service must fit within working hours and around existing appointments. Minimum advance notice and the booking window also limit the times customers can choose.",
  },
  {
    q: "Does recording a card payment charge the customer's card?",
    a: "No. Payment records track money received through your shop's payment process. Collect payment through your usual terminal or provider, then record the method and amounts on the invoice.",
  },
  {
    q: "Can I turn an estimate into an invoice?",
    a: "Yes. Open the estimate and use its conversion action, then review the resulting draft invoice before sending it. Record the customer's decision separately; sending an estimate does not mean it has been accepted.",
  },
  {
    q: "Why did an email or text message not arrive?",
    a: "Check the recipient details and the result of the send action. For email, ask the recipient to check spam and confirm the address is spelled correctly. Text messages need your shop's dedicated number to be active and respect a customer's STOP request. If sending fails, keep the document and try again, or contact us if it keeps failing.",
  },
  {
    q: "Why is a setting or action missing from my account?",
    a: "Access depends on your role, your plan and (with Multi-Shop) the locations you've been given. Ask the shop owner to review them. Each team member should use their own account rather than sharing another person's credentials.",
  },
  {
    q: "Who do I contact if I run into a problem?",
    a: "Reach out through the contact page and we'll get back to you.",
  },
];

const FAQS_FR = [
  { q: "Qu'est-ce que GarageOS?", a: "GarageOS est un logiciel de gestion pour ateliers de mécanique indépendants — réservation, inspections, soumissions et approbations, bons de travail, facturation, rappels, portail client et communications avec les clients, le tout au même endroit." },
  { q: "Comment commencer?", a: "Créez un compte, confirmez votre courriel, choisissez votre forfait et ajoutez un mode de paiement pour démarrer l'essai gratuit de 14 jours — vous payez 0 $ aujourd'hui. Suivez ensuite la liste de démarrage rapide pour configurer votre atelier et inviter votre équipe." },
  { q: "Comment fonctionne l'essai gratuit?", a: "Vous choisissez Core, Pro ou Complete et ajoutez un mode de paiement pendant la configuration. Rien n'est facturé pendant 14 jours; nous affichons la date et le montant exacts de votre premier paiement, puis votre abonnement démarre automatiquement. Vous pouvez annuler depuis la Facturation avant la fin de l'essai." },
  { q: "Puis-je changer de forfait plus tard?", a: "Oui. Gérez votre forfait et votre mode de paiement depuis Paramètres → Facturation. Les fonctionnalités qui exigent un forfait supérieur indiquent ce qui est requis, et vos données sont conservées." },
  { q: "Mes clients ont-ils un portail?", a: "Oui, avec tous les forfaits. Ouvrez un client et envoyez-lui par courriel un lien sécurisé pour consulter ses véhicules, rendez-vous, soumissions, factures et historique d'entretien. Les liens expirent après 30 jours et vous pouvez les révoquer en tout temps." },
  { q: "Puis-je gérer plus d'un emplacement?", a: "Oui, avec le forfait Complete (Multi-Shop) : ajoutez des emplacements sous une même organisation, passez de l'un à l'autre et consultez des rapports consolidés ou par emplacement. Chaque emplacement conserve ses propres clients, travaux et factures." },
  { q: "Les clients peuvent-ils réserver en ligne?", a: "Oui — chaque atelier dispose de sa propre page de réservation à son image où les clients peuvent demander un rendez-vous directement." },
  { q: "Les données de mon atelier sont-elles séparées de celles des autres ateliers?", a: "Oui. Les clients, véhicules, rendez-vous et factures de chaque atelier sont limités à cet atelier seulement." },
  { q: "Pourquoi n'y a-t-il aucune plage horaire sur la page de réservation?", a: "Vérifiez que la réservation en ligne est activée, que l'atelier est ouvert ce jour-là et qu'au moins un mécanicien est disponible pour les réservations. Le service doit tenir dans les heures d'ouverture et autour des rendez-vous existants. Le préavis minimal et la fenêtre de réservation limitent aussi les heures offertes." },
  { q: "Enregistrer un paiement par carte débite-t-il la carte du client?", a: "Non. Les paiements enregistrés servent à suivre l'argent reçu par le processus de paiement de votre atelier. Encaissez avec votre terminal ou fournisseur habituel, puis inscrivez le mode de paiement et les montants sur la facture." },
  { q: "Puis-je transformer une soumission en facture?", a: "Oui. Ouvrez la soumission et utilisez son action de conversion, puis vérifiez le brouillon de facture obtenu avant de l'envoyer. Enregistrez séparément la décision du client; l'envoi d'une soumission ne signifie pas qu'elle a été acceptée." },
  { q: "Pourquoi un courriel ou un texto n'est-il pas arrivé?", a: "Vérifiez les coordonnées du destinataire et le résultat de l'envoi. Pour un courriel, demandez au destinataire de vérifier ses pourriels et de confirmer l'orthographe de l'adresse. Les textos exigent que le numéro dédié de votre atelier soit actif et respectent une demande STOP du client. Si l'envoi échoue, conservez le document et réessayez, ou communiquez avec nous si le problème persiste." },
  { q: "Pourquoi un paramètre ou une action est-il absent de mon compte?", a: "L'accès dépend de votre rôle, de votre forfait et (avec Multi-Shop) des emplacements qui vous ont été attribués. Demandez au propriétaire de l'atelier de les vérifier. Chaque membre de l'équipe devrait utiliser son propre compte plutôt que les identifiants d'une autre personne." },
  { q: "Qui contacter en cas de problème?", a: "Écrivez-nous depuis la page de contact et nous vous répondrons." },
];

function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="divide-y divide-slate-100">
      {items.map((item) => (
        <details key={item.q} className="py-6">
          <summary className="cursor-pointer font-semibold text-slate-900">{item.q}</summary>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export default function HelpPage() {
  return (
    <MarketingPageShell>
      <Bilingual
        en={<PageHero eyebrow="Resources" heading="Help Center" description="Find a setup guide, solve a booking issue or get help with estimates and invoices." />}
        fr={<PageHero eyebrow="Ressources" heading="Centre d'aide" description="Trouvez un guide de configuration, réglez un problème de réservation ou obtenez de l'aide avec les soumissions et les factures." />}
      />

      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <Bilingual
            en={<h2 className="mb-6 text-2xl font-bold text-slate-900">Start with a guide</h2>}
            fr={<h2 className="mb-6 text-2xl font-bold text-slate-900">Commencez par un guide</h2>}
          />
          <p className="mb-6 text-sm text-slate-600">
            <Bilingual en={<>New to your shop&apos;s account? </>} fr={<>Nouveau sur le compte de votre atelier? </>} />
            <Link href="/quick-start" className="text-brand-blue font-semibold hover:text-brand-blue-dark">
              <Bilingual en={<>Follow the Quick Start checklist</>} fr={<>Suivez la liste de démarrage rapide</>} />
            </Link>
            .
          </p>
          <GroupedResourceCards articles={GUIDES} basePath="/guides" />
          <Bilingual
            en={<h2 className="mb-3 mt-16 text-2xl font-bold text-slate-900">Common questions</h2>}
            fr={<h2 className="mb-3 mt-16 text-2xl font-bold text-slate-900">Questions fréquentes</h2>}
          />
          <Bilingual en={<FaqList items={FAQS} />} fr={<FaqList items={FAQS_FR} />} />

          <p className="mt-10 text-sm text-slate-600">
            <Bilingual en={<>Didn&apos;t find what you were looking for? </>} fr={<>Vous n&apos;avez pas trouvé ce que vous cherchiez? </>} />
            <Link href="/contact" className="text-brand-blue font-semibold hover:text-brand-blue-dark">
              <Bilingual en={<>Contact us</>} fr={<>Communiquez avec nous</>} />
            </Link>
            .
          </p>
        </div>
      </section>
    </MarketingPageShell>
  );
}
