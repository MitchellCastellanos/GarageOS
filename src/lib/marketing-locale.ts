/**
 * Copy for the public GarageOS marketing landing page (src/app/page.tsx).
 * Separate from src/lib/site-locale.ts, which drives the per-shop public
 * booking pages (FR/EN/ES) — this dictionary is the SaaS marketing site,
 * bilingual FR/EN only, defaulting to English.
 */
export type MarketingLocale = "en" | "fr";

export const DEFAULT_MARKETING_LOCALE: MarketingLocale = "en";

export interface MarketingDictionary {
  meta: {
    title: string;
    description: string;
  };
  nav: {
    product: string;
    features: string;
    pricing: string;
    resources: string;
    login: string;
    getStarted: string;
  };
  resourcesMenu: { label: string; href: string }[];
  hero: {
    eyebrow: string;
    titleLine1: string;
    titleLine2: string;
    description: string;
    ctaPrimary: string;
    ctaSecondary: string;
    bullets: [string, string, string];
    mockupCaption: string;
    dashboard: {
      greeting: string;
      subtitle: string;
      shopName: string;
      searchPlaceholder: string;
      stats: [
        { value: string; label: string },
        { value: string; label: string },
        { value: string; label: string },
        { value: string; label: string },
      ];
      nav: string[];
      scheduleTitle: string;
      viewCalendar: string;
      schedule: {
        time: string;
        vehicle: string;
        client: string;
        service: string;
        status: string;
      }[];
      activityTitle: string;
      activity: { text: string; time: string }[];
    };
  };
  featureStrip: string[];
  workflow: {
    eyebrow: string;
    heading: string;
    description: string;
    steps: { title: string; description: string }[];
  };
  tools: {
    eyebrow: string;
    heading: string;
    description: string;
    highlights: { title: string; description: string }[];
    seeAll: string;
  };
  management: {
    eyebrow: string;
    heading: string;
    description: string;
    cards: { title: string; description: string }[];
  };
  brandControl: {
    eyebrow: string;
    heading: string;
    description: string;
    cta: string;
    phone: {
      shopName: string;
      title: string;
      greeting: string;
      body: string;
    };
    invoice: {
      shopName: string;
      invoiceLabel: string;
      billTo: string;
      client: string;
      email: string;
      vehicleLabel: string;
      items: { label: string; qty: string; price: string }[];
      subtotal: string;
      tax: string;
      total: string;
      thanks: string;
    };
  };
  builtFor: {
    eyebrow: string;
    heading: string;
    description: string;
    cta: string;
    quote: string;
    quoteAuthor: string;
  };
  pricing: {
    eyebrow: string;
    heading: string;
    monthly: string;
    yearly: string;
    save: string;
    perMonth: string;
    mostPopular: string;
    plans: {
      name: string;
      tagline: string;
      monthlyPrice: number;
      features: string[];
      cta: string;
    }[];
  };
  ctaBanner: {
    eyebrow: string;
    heading: string;
    description: string;
    cta: string;
  };
  footer: {
    tagline: string;
    columns: {
      product: { title: string; links: { label: string; href: string }[] };
      resources: { title: string; links: { label: string; href: string }[] };
      company: { title: string; links: { label: string; href: string }[] };
    };
    copyright: string;
    madeFor: string;
  };
  auth: {
    backToHome: string;
    hero: {
      eyebrow: string;
      titleLine1: string;
      titleLine2: string;
      titleAccent: string;
      description: string;
      features: [string, string, string, string, string, string];
      tagline: string;
      valueProps: [
        { title: string; caption: string },
        { title: string; caption: string },
        { title: string; caption: string },
      ];
    };
    login: {
      newToGarageOS: string;
      createAccount: string;
      welcomeBack: string;
      subtitle: string;
      emailLabel: string;
      emailPlaceholder: string;
      passwordLabel: string;
      forgotPassword: string;
      signIn: string;
      or: string;
      continueWithGoogle: string;
      /** Mensajes para los códigos de error que Auth.js manda en ?error= (pages.error = login). */
      errors: { credentials: string; oauth: string; generic: string };
      termsPrefix: string;
      termsLink: string;
      and: string;
      privacyLink: string;
    };
    signup: {
      alreadyHaveAccount: string;
      signIn: string;
      title: string;
      subtitle: string;
      shopNameLabel: string;
      shopNamePlaceholder: string;
      yourNameLabel: string;
      yourNamePlaceholder: string;
      passwordPlaceholder: string;
      createAccount: string;
      signUpWithGoogle: string;
      termsPrefix: string;
    };
    errors: {
      missingCredentials: string;
      invalidCredentials: string;
      emailNotVerified: string;
      connectionError: string;
      sessionError: string;
      missingShopName: string;
      missingName: string;
      invalidEmail: string;
      weakPassword: string;
      emailTaken: string;
      signupError: string;
      accountCreatedSignIn: string;
    };
  };
}

export const MARKETING_DICTIONARIES: Record<MarketingLocale, MarketingDictionary> = {
  en: {
    meta: {
      title: "GarageOS — Auto shop management software",
      description:
        "Run the whole job in one place — from booking and estimates to customer approval, invoicing and the next service reminder. Built for independent garages, by people who get it.",
    },
    nav: {
      product: "Product",
      features: "Features",
      pricing: "Pricing",
      resources: "Resources",
      login: "Login",
      getStarted: "Get Started",
    },
    resourcesMenu: [
      { label: "Help Center", href: "/help" },
      { label: "Quick Start", href: "/quick-start" },
      { label: "Guides", href: "/guides" },
      { label: "Blog", href: "/blog" },
      { label: "Changelog", href: "/changelog" },
    ],
    hero: {
      eyebrow: "Auto shop management software",
      titleLine1: "Less admin.",
      titleLine2: "More wrench time.",
      description:
        "Run the whole job in one place — from booking and estimates to customer approval, invoicing and the next service reminder.",
      ctaPrimary: "Get Started",
      ctaSecondary: "Watch Demo",
      bullets: ["Keep every job organized", "Keep customers in the loop", "Bring customers back"],
      mockupCaption: "Everything your shop needs, in one dashboard.",
      dashboard: {
        greeting: "Good morning, Alex",
        subtitle: "6 appointments today · 3 jobs in the shop",
        shopName: "Alex's Garage",
        searchPlaceholder: "Search customers, vehicles...",
        stats: [
          { value: "6", label: "Appointments today" },
          { value: "3", label: "Jobs in service" },
          { value: "2", label: "Awaiting approval" },
          { value: "4", label: "Ready for pickup" },
        ],
        nav: [
          "Dashboard",
          "Appointments",
          "Estimates",
          "Customers",
          "Vehicles",
          "Invoices",
          "Messages",
          "Reminders",
          "Reports",
          "Inventory",
          "Services",
          "Settings",
        ],
        scheduleTitle: "Today's Schedule",
        viewCalendar: "View Calendar",
        schedule: [
          {
            time: "8:00 AM",
            vehicle: "2019 Honda Civic",
            client: "John D.",
            service: "Oil Change",
            status: "Checked In",
          },
          {
            time: "9:30 AM",
            vehicle: "2021 Ford F-150",
            client: "Sarah M.",
            service: "Diagnostics",
            status: "In Progress",
          },
          {
            time: "11:00 AM",
            vehicle: "2018 Toyota RAV4",
            client: "Mike R.",
            service: "Brakes",
            status: "Scheduled",
          },
          {
            time: "1:00 PM",
            vehicle: "2020 BMW 330i",
            client: "Emily T.",
            service: "Tire Change",
            status: "Scheduled",
          },
        ],
        activityTitle: "Recent Activity",
        activity: [
          { text: "Invoice #1054 paid", time: "2 hours ago" },
          { text: "New appointment booked", time: "3 hours ago" },
          { text: "Estimate approved", time: "4 hours ago" },
          { text: "Vehicle ready for pickup", time: "5 hours ago" },
        ],
      },
    },
    featureStrip: [
      "Appointments & Booking",
      "Vehicle Check-In",
      "Estimates & Approvals",
      "Parts & Labour",
      "Customer Messaging",
      "Invoicing & Payments",
      "Vehicle History",
      "Inventory & Reports",
    ],
    workflow: {
      eyebrow: "One connected workflow",
      heading: "From booking to the next visit.",
      description:
        "GarageOS keeps the customer, vehicle, approval, work and payment connected from start to finish.",
      steps: [
        {
          title: "Book",
          description: "Online or front-desk appointments, customers, vehicles and scheduling.",
        },
        {
          title: "Inspect",
          description: "Note the vehicle's condition, mileage and the customer's concern before you price the job.",
        },
        {
          title: "Approve",
          description: "Turn the proposed work into a clear estimate and capture the customer's decision.",
        },
        {
          title: "Repair",
          description: "Once approved, the team gets to work — the front desk stays aligned on what's confirmed.",
        },
        {
          title: "Pay",
          description: "Invoice the completed work, record payment and keep the service history together.",
        },
        {
          title: "Return",
          description: "Set a maintenance reminder and follow up when the vehicle is due back.",
        },
      ],
    },
    tools: {
      eyebrow: "Built for real shops",
      heading: "Tools that actually make your life easier.",
      description:
        "From the first appointment to the final invoice, GarageOS helps you stay organized, professional and profitable.",
      highlights: [
        {
          title: "Clear, itemized estimates",
          description:
            "Capture the vehicle's condition and the proposed work, then price it out — no retyping between the estimate and the invoice.",
        },
        {
          title: "Customer approvals",
          description: "Send a clear estimate and keep a traceable record of what the customer approved and when.",
        },
        {
          title: "Keep customers in the loop",
          description: "Send branded updates by email or text, including letting a customer know their vehicle is ready.",
        },
        {
          title: "Maintenance reminders",
          description: "Keep future service needs attached to the customer and vehicle so the next visit doesn't get forgotten.",
        },
        {
          title: "Complete vehicle history",
          description: "Appointments, estimates and invoices all stay connected to the vehicle record.",
        },
        {
          title: "Built to run the shop",
          description: "Inventory, reports, team access and multi-location tools give owners visibility beyond a single job.",
        },
      ],
      seeAll: "See all features",
    },
    management: {
      eyebrow: "Beyond the job",
      heading: "Run more than the job.",
      description: "The tools an owner needs to run the whole shop, not just a single appointment.",
      cards: [
        { title: "Inventory & parts", description: "Track stock and movement history." },
        {
          title: "Reports & visibility",
          description: "See shop activity and business performance without rebuilding the day in spreadsheets.",
        },
        {
          title: "Multi-location",
          description: "Operate multiple shop locations with shared access where configured.",
        },
        {
          title: "Communications & branding",
          description: "Manage customer messaging and keep the shop's brand in front of customers.",
        },
      ],
    },
    brandControl: {
      eyebrow: "Your brand. Your customers.",
      heading: "Look professional. Stay in control.",
      description:
        "Your customers see your shop — from booking and approvals to status updates and invoices. GarageOS stays behind the scenes while your logo, contact information and communication identity stay front and center.",
      cta: "See how it works",
      phone: {
        shopName: "Riverside Auto",
        title: "Your vehicle is ready",
        greeting: "Hi James,",
        body: "Your 2019 Honda Civic is ready for pickup at Riverside Auto.",
      },
      invoice: {
        shopName: "RIVERSIDE AUTO",
        invoiceLabel: "Invoice #1034",
        billTo: "Bill to",
        client: "James Carter",
        email: "jamescarter@gmail.com",
        vehicleLabel: "2019 Honda Civic",
        items: [
          { label: "Oil Change", qty: "1", price: "$79.99" },
          { label: "Engine Air Filter", qty: "1", price: "$24.99" },
          { label: "Cabin Air Filter", qty: "1", price: "$29.99" },
          { label: "Labour", qty: "1", price: "$90.00" },
        ],
        subtotal: "$224.97",
        tax: "$33.70",
        total: "$258.67",
        thanks: "Thank you for your business.",
      },
    },
    builtFor: {
      eyebrow: "More than software",
      heading: "Built for independent shops — not enterprise process.",
      description:
        "GarageOS gives the front desk and owner one clear place to run the day while keeping technician interaction simple when it's needed. It works for a small single-location shop and can grow into multiple locations.",
      cta: "Get Started",
      quote: "A modern tool for real mechanics.",
      quoteAuthor: "The GarageOS Team",
    },
    pricing: {
      eyebrow: "Simple pricing",
      heading: "Choose the plan that fits your shop.",
      monthly: "Monthly",
      yearly: "Yearly",
      save: "Save 20%",
      perMonth: "/ month",
      mostPopular: "Most Popular",
      plans: [
        {
          name: "Starter",
          tagline: "Perfect for small shops getting started.",
          monthlyPrice: 39,
          features: [
            "Up to 2 users",
            "Appointments & scheduling",
            "Invoicing & estimates",
            "Customer & vehicle records",
            "Email support",
          ],
          cta: "Get Started",
        },
        {
          name: "Pro",
          tagline: "Everything you need to run your shop.",
          monthlyPrice: 79,
          features: [
            "Up to 5 users",
            "All Starter features",
            "Inventory & parts tracking",
            "Branded emails & documents",
            "Reports & analytics",
            "Priority support",
          ],
          cta: "Get Started",
        },
        {
          name: "Business",
          tagline: "For growing shops with more control.",
          monthlyPrice: 129,
          features: [
            "Unlimited users",
            "All Pro features",
            "Advanced reporting",
            "Multi-location support",
            "API access (coming soon)",
            "Dedicated support",
          ],
          cta: "Get Started",
        },
      ],
    },
    ctaBanner: {
      eyebrow: "Ready to get started?",
      heading: "Run your next job in GarageOS.",
      description: "Set up your shop and start bringing your workflow into one place.",
      cta: "Get Started",
    },
    footer: {
      tagline: "The operating system for modern auto shops.",
      columns: {
        product: {
          title: "Product",
          links: [
            { label: "Product", href: "/product" },
            { label: "Features", href: "/features" },
            { label: "Demo", href: "/demo" },
            { label: "Integrations", href: "/integrations" },
            { label: "Pricing", href: "/#pricing" },
          ],
        },
        resources: {
          title: "Resources",
          links: [
            { label: "Quick Start", href: "/quick-start" },
            { label: "Help Center", href: "/help" },
            { label: "Guides", href: "/guides" },
            { label: "Blog", href: "/blog" },
            { label: "Changelog", href: "/changelog" },
          ],
        },
        company: {
          title: "Company",
          links: [
            { label: "About", href: "/about" },
            { label: "Privacy", href: "/privacy" },
            { label: "Terms", href: "/terms" },
          ],
        },
      },
      copyright: "GarageOS. All rights reserved.",
      madeFor: "Built for the people who keep the world moving.",
    },
    auth: {
      backToHome: "Home",
      hero: {
        eyebrow: "Built for independent shops",
        titleLine1: "Run your shop",
        titleLine2: "with",
        titleAccent: "confidence.",
        description:
          "GarageOS brings appointments, customers, vehicles, quotes and invoicing together in one place — so you can focus on what you do best.",
        features: [
          "Appointments & Scheduling",
          "Customer Management",
          "Vehicle History",
          "Quotes & Invoicing",
          "Service Reminders",
          "Reports & Cash Flow",
        ],
        tagline: "Simple to use. Ready to grow.",
        valueProps: [
          { title: "Less paperwork", caption: "More time in the shop" },
          { title: "Happy customers", caption: "Automatic reminders" },
          { title: "Everything in one place", caption: "Appointments, quotes & cash flow" },
        ],
      },
      login: {
        newToGarageOS: "New to GarageOS?",
        createAccount: "Create account",
        welcomeBack: "Welcome back",
        subtitle: "Sign in to your account",
        emailLabel: "Email address",
        emailPlaceholder: "you@yourshop.com",
        passwordLabel: "Password",
        forgotPassword: "Forgot your password?",
        signIn: "Sign in",
        or: "or",
        continueWithGoogle: "Continue with Google",
        errors: {
          credentials: "Incorrect email or password, or your email isn't confirmed yet.",
          oauth: "We couldn't complete the Google sign-in. Please try again.",
          generic: "Something went wrong while signing in. Please try again.",
        },
        termsPrefix: "By signing in you agree to our",
        termsLink: "Terms of Service",
        and: "and",
        privacyLink: "Privacy Policy",
      },
      signup: {
        alreadyHaveAccount: "Already have an account?",
        signIn: "Sign in",
        title: "Create your account",
        subtitle: "Start using GarageOS at your shop",
        shopNameLabel: "Shop name",
        shopNamePlaceholder: "Joe's Auto Repair",
        yourNameLabel: "Your name",
        yourNamePlaceholder: "Alex Martin",
        passwordPlaceholder: "At least 8 characters",
        createAccount: "Create account",
        signUpWithGoogle: "Sign up with Google",
        termsPrefix: "By creating an account you agree to our",
      },
      errors: {
        missingCredentials: "Enter your email and password",
        invalidCredentials: "Incorrect email or password",
        emailNotVerified: "Confirm your email before signing in — check your inbox for the link.",
        connectionError: "Connection error. Please try again.",
        sessionError: "Error creating your session. Please try again.",
        missingShopName: "Enter your shop name",
        missingName: "Enter your name",
        invalidEmail: "Invalid email address",
        weakPassword: "Password must be at least 8 characters",
        emailTaken: "That email already has an account. Sign in instead.",
        signupError: "Error creating your account. Please try again.",
        accountCreatedSignIn: "Account created. Please sign in to continue.",
      },
    },
  },
  fr: {
    meta: {
      title: "GarageOS — Logiciel de gestion pour ateliers mécaniques",
      description:
        "Gérez tout le déroulement d'une réparation au même endroit — de la réservation et de la soumission jusqu'à l'approbation du client, la facturation et le prochain rappel de service. Conçu pour les garages indépendants, par des gens qui comprennent le métier.",
    },
    nav: {
      product: "Produit",
      features: "Fonctionnalités",
      pricing: "Tarifs",
      resources: "Ressources",
      login: "Connexion",
      getStarted: "Commencer",
    },
    resourcesMenu: [
      { label: "Centre d'aide", href: "/help" },
      { label: "Démarrage rapide", href: "/quick-start" },
      { label: "Guides", href: "/guides" },
      { label: "Blogue", href: "/blog" },
      { label: "Nouveautés", href: "/changelog" },
    ],
    hero: {
      eyebrow: "Logiciel de gestion pour ateliers mécaniques",
      titleLine1: "Moins d'admin.",
      titleLine2: "Plus de temps sous le capot.",
      description:
        "Gérez tout le déroulement d'une réparation au même endroit — de la prise de rendez-vous et de la soumission jusqu'à l'approbation du client, la facturation et le prochain rappel de service.",
      ctaPrimary: "Commencer",
      ctaSecondary: "Voir la démo",
      bullets: ["Gardez chaque dossier organisé", "Gardez vos clients informés", "Faites revenir vos clients"],
      mockupCaption: "Tout ce dont votre atelier a besoin, dans un seul tableau de bord.",
      dashboard: {
        greeting: "Bonjour, Alex",
        subtitle: "6 rendez-vous aujourd'hui · 3 dossiers en atelier",
        shopName: "Garage d'Alex",
        searchPlaceholder: "Rechercher un client, un véhicule...",
        stats: [
          { value: "6", label: "Rendez-vous aujourd'hui" },
          { value: "3", label: "Dossiers en cours" },
          { value: "2", label: "En attente d'approbation" },
          { value: "4", label: "Prêts à récupérer" },
        ],
        nav: [
          "Tableau de bord",
          "Rendez-vous",
          "Soumissions",
          "Clients",
          "Véhicules",
          "Factures",
          "Messages",
          "Rappels",
          "Rapports",
          "Inventaire",
          "Services",
          "Paramètres",
        ],
        scheduleTitle: "Horaire du jour",
        viewCalendar: "Voir le calendrier",
        schedule: [
          {
            time: "8 h 00",
            vehicle: "Honda Civic 2019",
            client: "John D.",
            service: "Changement d'huile",
            status: "Arrivé",
          },
          {
            time: "9 h 30",
            vehicle: "Ford F-150 2021",
            client: "Sarah M.",
            service: "Diagnostic",
            status: "En cours",
          },
          {
            time: "11 h 00",
            vehicle: "Toyota RAV4 2018",
            client: "Mike R.",
            service: "Freins",
            status: "Prévu",
          },
          {
            time: "13 h 00",
            vehicle: "BMW 330i 2020",
            client: "Emily T.",
            service: "Changement de pneus",
            status: "Prévu",
          },
        ],
        activityTitle: "Activité récente",
        activity: [
          { text: "Facture #1054 payée", time: "il y a 2 heures" },
          { text: "Nouveau rendez-vous", time: "il y a 3 heures" },
          { text: "Soumission approuvée", time: "il y a 4 heures" },
          { text: "Véhicule prêt à récupérer", time: "il y a 5 heures" },
        ],
      },
    },
    featureStrip: [
      "Rendez-vous et réservation",
      "Accueil du véhicule",
      "Soumissions et approbations",
      "Pièces et main-d'œuvre",
      "Communication client",
      "Facturation et paiements",
      "Historique des véhicules",
      "Inventaire et rapports",
    ],
    workflow: {
      eyebrow: "Un flux de travail connecté",
      heading: "De la réservation à la prochaine visite.",
      description:
        "GarageOS garde le client, le véhicule, l'approbation, le travail et le paiement connectés du début à la fin.",
      steps: [
        {
          title: "Réserver",
          description: "Rendez-vous en ligne ou sur place, clients, véhicules et horaire.",
        },
        {
          title: "Inspecter",
          description: "Notez l'état du véhicule, le kilométrage et la demande du client avant d'établir le prix.",
        },
        {
          title: "Approuver",
          description: "Transformez le travail proposé en soumission claire et enregistrez la décision du client.",
        },
        {
          title: "Réparer",
          description: "Une fois approuvé, l'équipe se met au travail — la réception reste alignée sur ce qui est confirmé.",
        },
        {
          title: "Payer",
          description: "Facturez le travail complété, enregistrez le paiement et gardez l'historique de service ensemble.",
        },
        {
          title: "Revenir",
          description: "Créez un rappel de service et faites un suivi lorsque le véhicule doit revenir.",
        },
      ],
    },
    tools: {
      eyebrow: "Conçu pour de vrais ateliers",
      heading: "Des outils qui vous simplifient vraiment la vie.",
      description:
        "Du premier rendez-vous jusqu'à la facture finale, GarageOS vous aide à rester organisé, professionnel et rentable.",
      highlights: [
        {
          title: "Des soumissions claires et détaillées",
          description:
            "Notez l'état du véhicule et le travail proposé, puis établissez le prix — sans ressaisir entre la soumission et la facture.",
        },
        {
          title: "Approbations client",
          description: "Envoyez une soumission claire et gardez une trace de ce que le client a approuvé, et quand.",
        },
        {
          title: "Gardez vos clients informés",
          description: "Envoyez des mises à jour à votre image par courriel ou texto, y compris pour aviser un client que son véhicule est prêt.",
        },
        {
          title: "Rappels de service",
          description: "Gardez les prochains besoins de service liés au client et au véhicule pour ne pas oublier la prochaine visite.",
        },
        {
          title: "Historique complet du véhicule",
          description: "Rendez-vous, soumissions et factures restent tous liés au dossier du véhicule.",
        },
        {
          title: "Conçu pour gérer l'atelier",
          description: "Inventaire, rapports, accès d'équipe et outils multi-établissements donnent aux propriétaires une vue au-delà d'un seul dossier.",
        },
      ],
      seeAll: "Voir toutes les fonctionnalités",
    },
    management: {
      eyebrow: "Au-delà du dossier",
      heading: "Gérez plus que le dossier.",
      description: "Les outils dont un propriétaire a besoin pour gérer tout l'atelier, pas seulement un rendez-vous.",
      cards: [
        { title: "Inventaire et pièces", description: "Suivez le stock et l'historique des mouvements." },
        {
          title: "Rapports et visibilité",
          description: "Voyez l'activité de l'atelier et la performance de l'entreprise sans reconstruire la journée dans des feuilles de calcul.",
        },
        {
          title: "Multi-établissements",
          description: "Gérez plusieurs emplacements avec un accès partagé lorsque configuré.",
        },
        {
          title: "Communications et image de marque",
          description: "Gérez la messagerie client et gardez l'image de votre atelier devant vos clients.",
        },
      ],
    },
    brandControl: {
      eyebrow: "Votre marque. Vos clients.",
      heading: "Paraissez professionnel. Gardez le contrôle.",
      description:
        "Vos clients voient votre atelier — de la réservation et des approbations jusqu'aux mises à jour de statut et aux factures. GarageOS reste en coulisses pendant que votre logo, vos coordonnées et votre identité de communication restent à l'avant-plan.",
      cta: "Voir comment ça fonctionne",
      phone: {
        shopName: "Riverside Auto",
        title: "Votre véhicule est prêt",
        greeting: "Bonjour James,",
        body: "Votre Honda Civic 2019 est prête à être récupérée chez Riverside Auto.",
      },
      invoice: {
        shopName: "RIVERSIDE AUTO",
        invoiceLabel: "Facture #1034",
        billTo: "Facturé à",
        client: "James Carter",
        email: "jamescarter@gmail.com",
        vehicleLabel: "Honda Civic 2019",
        items: [
          { label: "Changement d'huile", qty: "1", price: "79,99 $" },
          { label: "Filtre à air moteur", qty: "1", price: "24,99 $" },
          { label: "Filtre à air habitacle", qty: "1", price: "29,99 $" },
          { label: "Main-d'œuvre", qty: "1", price: "90,00 $" },
        ],
        subtotal: "224,97 $",
        tax: "33,70 $",
        total: "258,67 $",
        thanks: "Merci de votre confiance.",
      },
    },
    builtFor: {
      eyebrow: "Plus qu'un logiciel",
      heading: "Conçu pour les garages indépendants — pas pour un processus d'entreprise.",
      description:
        "GarageOS donne à la réception et au propriétaire un seul endroit clair pour gérer la journée, tout en gardant l'interaction des techniciens simple quand c'est nécessaire. Ça fonctionne pour un atelier à un seul établissement et peut grandir vers plusieurs établissements.",
      cta: "Commencer",
      quote: "Un outil moderne pour de vrais mécaniciens.",
      quoteAuthor: "L'équipe GarageOS",
    },
    pricing: {
      eyebrow: "Tarification simple",
      heading: "Choisissez le forfait qui convient à votre atelier.",
      monthly: "Mensuel",
      yearly: "Annuel",
      save: "Économisez 20 %",
      perMonth: "/ mois",
      mostPopular: "Le plus populaire",
      plans: [
        {
          name: "Débutant",
          tagline: "Parfait pour les petits ateliers qui démarrent.",
          monthlyPrice: 39,
          features: [
            "Jusqu'à 2 utilisateurs",
            "Rendez-vous et horaire",
            "Facturation et soumissions",
            "Dossiers clients et véhicules",
            "Soutien par courriel",
          ],
          cta: "Commencer",
        },
        {
          name: "Pro",
          tagline: "Tout ce qu'il faut pour gérer votre atelier.",
          monthlyPrice: 79,
          features: [
            "Jusqu'à 5 utilisateurs",
            "Toutes les fonctionnalités Débutant",
            "Suivi de l'inventaire et des pièces",
            "Courriels et documents à votre image",
            "Rapports et analyses",
            "Soutien prioritaire",
          ],
          cta: "Commencer",
        },
        {
          name: "Entreprise",
          tagline: "Pour les ateliers en croissance qui veulent plus de contrôle.",
          monthlyPrice: 129,
          features: [
            "Utilisateurs illimités",
            "Toutes les fonctionnalités Pro",
            "Rapports avancés",
            "Support multi-établissements",
            "Accès API (bientôt disponible)",
            "Soutien dédié",
          ],
          cta: "Commencer",
        },
      ],
    },
    ctaBanner: {
      eyebrow: "Prêt à commencer?",
      heading: "Gérez votre prochain dossier dans GarageOS.",
      description: "Configurez votre atelier et commencez à rassembler votre flux de travail au même endroit.",
      cta: "Commencer",
    },
    footer: {
      tagline: "Le système d'exploitation des ateliers mécaniques modernes.",
      columns: {
        product: {
          title: "Produit",
          links: [
            { label: "Produit", href: "/product" },
            { label: "Fonctionnalités", href: "/features" },
            { label: "Démo", href: "/demo" },
            { label: "Intégrations", href: "/integrations" },
            { label: "Tarifs", href: "/#pricing" },
          ],
        },
        resources: {
          title: "Ressources",
          links: [
            { label: "Démarrage rapide", href: "/quick-start" },
            { label: "Centre d'aide", href: "/help" },
            { label: "Guides", href: "/guides" },
            { label: "Blogue", href: "/blog" },
            { label: "Nouveautés", href: "/changelog" },
          ],
        },
        company: {
          title: "Entreprise",
          links: [
            { label: "À propos", href: "/about" },
            { label: "Confidentialité", href: "/privacy" },
            { label: "Conditions", href: "/terms" },
          ],
        },
      },
      copyright: "GarageOS. Tous droits réservés.",
      madeFor: "Conçu pour les gens qui gardent le monde en mouvement.",
    },
    auth: {
      backToHome: "Accueil",
      hero: {
        eyebrow: "Conçu pour les garages indépendants",
        titleLine1: "Gérez votre atelier",
        titleLine2: "en toute",
        titleAccent: "confiance.",
        description:
          "GarageOS regroupe rendez-vous, clients, véhicules, soumissions et facturation en un seul endroit — pour que vous puissiez vous concentrer sur votre métier.",
        features: [
          "Rendez-vous et horaire",
          "Gestion des clients",
          "Historique des véhicules",
          "Soumissions et facturation",
          "Rappels de service",
          "Rapports et caisse",
        ],
        tagline: "Simple à utiliser. Prêt à grandir.",
        valueProps: [
          { title: "Moins de paperasse", caption: "Plus de temps à l'atelier" },
          { title: "Clients satisfaits", caption: "Rappels automatiques" },
          { title: "Tout au même endroit", caption: "Rendez-vous, soumissions et caisse" },
        ],
      },
      login: {
        newToGarageOS: "Nouveau sur GarageOS?",
        createAccount: "Créer un compte",
        welcomeBack: "Content de vous revoir",
        subtitle: "Connectez-vous à votre compte",
        emailLabel: "Adresse courriel",
        emailPlaceholder: "vous@votreatelier.com",
        passwordLabel: "Mot de passe",
        forgotPassword: "Mot de passe oublié?",
        signIn: "Se connecter",
        or: "ou",
        continueWithGoogle: "Continuer avec Google",
        errors: {
          credentials: "Courriel ou mot de passe incorrect, ou courriel pas encore confirmé.",
          oauth: "La connexion avec Google n'a pas pu aboutir. Veuillez réessayer.",
          generic: "Une erreur est survenue pendant la connexion. Veuillez réessayer.",
        },
        termsPrefix: "En vous connectant, vous acceptez nos",
        termsLink: "conditions d'utilisation",
        and: "et notre",
        privacyLink: "politique de confidentialité",
      },
      signup: {
        alreadyHaveAccount: "Vous avez déjà un compte?",
        signIn: "Se connecter",
        title: "Créez votre compte",
        subtitle: "Commencez à utiliser GarageOS dans votre atelier",
        shopNameLabel: "Nom de l'atelier",
        shopNamePlaceholder: "Garage Martin",
        yourNameLabel: "Votre nom",
        yourNamePlaceholder: "Alex Martin",
        passwordPlaceholder: "8 caractères minimum",
        createAccount: "Créer un compte",
        signUpWithGoogle: "S'inscrire avec Google",
        termsPrefix: "En créant un compte, vous acceptez nos",
      },
      errors: {
        missingCredentials: "Entrez votre courriel et votre mot de passe",
        invalidCredentials: "Courriel ou mot de passe incorrect",
        emailNotVerified: "Confirmez votre courriel avant de vous connecter — vérifiez votre boîte de réception pour le lien.",
        connectionError: "Erreur de connexion. Veuillez réessayer.",
        sessionError: "Erreur lors de la création de votre session. Veuillez réessayer.",
        missingShopName: "Entrez le nom de votre atelier",
        missingName: "Entrez votre nom",
        invalidEmail: "Adresse courriel invalide",
        weakPassword: "Le mot de passe doit contenir au moins 8 caractères",
        emailTaken: "Ce courriel a déjà un compte. Connectez-vous plutôt.",
        signupError: "Erreur lors de la création de votre compte. Veuillez réessayer.",
        accountCreatedSignIn: "Compte créé. Veuillez vous connecter pour continuer.",
      },
    },
  },
};
