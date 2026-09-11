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
  tools: {
    eyebrow: string;
    heading: string;
    description: string;
    left: string[];
    right: string[];
    more: string;
    seeAll: string;
    quote: { text: string; author: string; shop: string };
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
      button: string;
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
  testimonials: {
    eyebrow: string;
    heading: string;
    items: { quote: string; name: string; shop: string }[];
    shopNames: string[];
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
        "Manage appointments, work orders, invoicing and customer communication — all in one place. Built for independent garages, by people who get it.",
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
      { label: "Blog", href: "/blog" },
      { label: "Guides", href: "/guides" },
      { label: "Changelog", href: "/changelog" },
    ],
    hero: {
      eyebrow: "Auto shop management software",
      titleLine1: "Less admin.",
      titleLine2: "More wrench time.",
      description:
        "Manage appointments, work orders, invoicing, customer communication and more — all in one place. Built for independent garages, by people who get it.",
      ctaPrimary: "Get Started",
      ctaSecondary: "Watch Demo",
      bullets: ["Save time every day", "Get paid faster", "Happier customers"],
      mockupCaption: "Everything your shop needs, in one dashboard.",
      dashboard: {
        greeting: "Good morning, Alex",
        subtitle: "6 appointments today · 3 work orders in progress",
        shopName: "Alex's Garage",
        searchPlaceholder: "Search customers, vehicles...",
        stats: [
          { value: "6", label: "Appointments today" },
          { value: "3", label: "In progress" },
          { value: "2", label: "Awaiting approval" },
          { value: "4", label: "Ready for pickup" },
        ],
        nav: [
          "Dashboard",
          "Appointments",
          "Work Orders",
          "Customers",
          "Vehicles",
          "Invoices",
          "Estimates",
          "Messages",
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
          { text: "New appointment", time: "3 hours ago" },
          { text: "Estimate sent", time: "4 hours ago" },
          { text: "Work order completed", time: "5 hours ago" },
        ],
      },
    },
    featureStrip: [
      "Appointments & Scheduling",
      "Work Orders & Estimates",
      "Invoicing & Payments",
      "Customer Communication",
      "Vehicle History & Records",
      "Inventory & Parts",
      "Reports & Insights",
      "Your Brand Everywhere",
    ],
    tools: {
      eyebrow: "Built for real shops",
      heading: "Tools that actually make your life easier.",
      description:
        "From the first appointment to the final invoice, GarageOS helps you stay organized, professional and profitable.",
      left: [
        "Online & in-person booking",
        "Work orders & digital inspections",
        "Estimates with approval flow",
        "Invoicing & payments (card, cash, etc.)",
        "Branded emails & documents",
        "Customer & vehicle history",
      ],
      right: [
        "Inventory & parts tracking",
        "Service reminders",
        "Multi-techs and roles",
        "Reports & analytics",
        "Mobile friendly (shop floor ready)",
      ],
      more: "And much more...",
      seeAll: "See all features",
      quote: {
        text: "GarageOS has made our day-to-day so much more efficient. We spend less time on paperwork and more time doing what we love.",
        author: "Marc-Olivier",
        shop: "Atelier Mécanique 514",
      },
    },
    brandControl: {
      eyebrow: "Your brand. Your customers.",
      heading: "Look professional. Stay in control.",
      description:
        "Send appointment confirmations, estimates, invoices and follow-ups using your own logo, colors and contact information. GarageOS works behind the scenes — your customers see your brand.",
      cta: "See how it works",
      phone: {
        shopName: "Riverside Auto",
        title: "Your appointment is confirmed",
        greeting: "Hi James,",
        body: "Your appointment for your 2019 Honda Civic is confirmed for Monday, Sep 16 at 10:00 AM. We look forward to seeing you!",
        button: "Add to Calendar",
      },
      invoice: {
        shopName: "RIVERSIDE AUTO",
        invoiceLabel: "Invoice #1034",
        billTo: "Bill to",
        client: "James Carter",
        email: "jamescarter@gmail.com",
        vehicleLabel: "2019 Honda Civic · VIN: 2HGFC2F79KH123456",
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
      heading: "Built for independent garages. Backed for what's next.",
      description:
        "Whether you're a 1-person shop or a multi-bay operation, GarageOS grows with you. We're here to help you run a better business — today and tomorrow.",
      cta: "Get Started",
      quote: "A modern tool for real mechanics.",
      quoteAuthor: "The GarageOS Team",
    },
    testimonials: {
      eyebrow: "Shop owners love GarageOS",
      heading: "Real shops. Real results.",
      items: [
        {
          quote:
            "I went from spreadsheets and sticky notes to having everything in one place. Game changer.",
          name: "Steve L.",
          shop: "Lachine Mécanique",
        },
        {
          quote:
            "Our communication with customers is so much better now. The branded emails and inspection reports look incredible.",
          name: "Caroline D.",
          shop: "Performance Auto",
        },
        {
          quote:
            "Simple to use, super powerful, and the support team actually listens. Highly recommend.",
          name: "Daniel R.",
          shop: "Atelier 514",
        },
      ],
      shopNames: ["Performance Auto", "Lachine Mécanique", "ATELIER 514", "RPM GARAGE", "Riverside Auto"],
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
            "Appointments & work orders",
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
      heading: "Join hundreds of garages already running on GarageOS.",
      description: "Set up your shop in minutes. No credit card required.",
      cta: "Get Started",
    },
    footer: {
      tagline: "The operating system for modern auto shops.",
      columns: {
        product: {
          title: "Product",
          links: [
            { label: "Features", href: "/features" },
            { label: "Pricing", href: "/#pricing" },
            { label: "Integrations", href: "/integrations" },
            { label: "Changelog", href: "/changelog" },
          ],
        },
        resources: {
          title: "Resources",
          links: [
            { label: "Help Center", href: "/help" },
            { label: "Blog", href: "/blog" },
            { label: "Guides", href: "/guides" },
            { label: "Contact", href: "/contact" },
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
        "Gérez vos rendez-vous, ordres de travail, facturation et communication client — le tout au même endroit. Conçu pour les garages indépendants, par des gens qui comprennent le métier.",
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
      { label: "Blogue", href: "/blog" },
      { label: "Guides", href: "/guides" },
      { label: "Nouveautés", href: "/changelog" },
    ],
    hero: {
      eyebrow: "Logiciel de gestion pour ateliers mécaniques",
      titleLine1: "Moins d'admin.",
      titleLine2: "Plus de temps sous le capot.",
      description:
        "Gérez vos rendez-vous, ordres de travail, facturation, communication client et plus encore — le tout au même endroit. Conçu pour les garages indépendants, par des gens qui comprennent le métier.",
      ctaPrimary: "Commencer",
      ctaSecondary: "Voir la démo",
      bullets: ["Gagnez du temps chaque jour", "Soyez payé plus vite", "Des clients plus satisfaits"],
      mockupCaption: "Tout ce dont votre atelier a besoin, dans un seul tableau de bord.",
      dashboard: {
        greeting: "Bonjour, Alex",
        subtitle: "6 rendez-vous aujourd'hui · 3 ordres de travail en cours",
        shopName: "Garage d'Alex",
        searchPlaceholder: "Rechercher un client, un véhicule...",
        stats: [
          { value: "6", label: "Rendez-vous aujourd'hui" },
          { value: "3", label: "En cours" },
          { value: "2", label: "En attente d'approbation" },
          { value: "4", label: "Prêts à récupérer" },
        ],
        nav: [
          "Tableau de bord",
          "Rendez-vous",
          "Ordres de travail",
          "Clients",
          "Véhicules",
          "Factures",
          "Soumissions",
          "Messages",
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
          { text: "Soumission envoyée", time: "il y a 4 heures" },
          { text: "Ordre de travail complété", time: "il y a 5 heures" },
        ],
      },
    },
    featureStrip: [
      "Rendez-vous et horaire",
      "Ordres de travail et soumissions",
      "Facturation et paiements",
      "Communication client",
      "Historique des véhicules",
      "Inventaire et pièces",
      "Rapports et statistiques",
      "Votre image de marque partout",
    ],
    tools: {
      eyebrow: "Conçu pour de vrais ateliers",
      heading: "Des outils qui vous simplifient vraiment la vie.",
      description:
        "Du premier rendez-vous jusqu'à la facture finale, GarageOS vous aide à rester organisé, professionnel et rentable.",
      left: [
        "Réservation en ligne et sur place",
        "Ordres de travail et inspections numériques",
        "Soumissions avec approbation client",
        "Facturation et paiements (carte, comptant, etc.)",
        "Courriels et documents à votre image",
        "Historique clients et véhicules",
      ],
      right: [
        "Suivi de l'inventaire et des pièces",
        "Rappels de service",
        "Plusieurs techniciens et rôles",
        "Rapports et analyses",
        "Pensé pour le plancher d'atelier (mobile)",
      ],
      more: "Et bien plus encore...",
      seeAll: "Voir toutes les fonctionnalités",
      quote: {
        text: "GarageOS a rendu notre quotidien tellement plus efficace. On passe moins de temps dans la paperasse et plus de temps à faire ce qu'on aime.",
        author: "Marc-Olivier",
        shop: "Atelier Mécanique 514",
      },
    },
    brandControl: {
      eyebrow: "Votre marque. Vos clients.",
      heading: "Paraissez professionnel. Gardez le contrôle.",
      description:
        "Envoyez confirmations de rendez-vous, soumissions, factures et suivis avec votre propre logo, vos couleurs et vos coordonnées. GarageOS travaille en coulisses — vos clients voient votre marque.",
      cta: "Voir comment ça fonctionne",
      phone: {
        shopName: "Riverside Auto",
        title: "Votre rendez-vous est confirmé",
        greeting: "Bonjour James,",
        body: "Votre rendez-vous pour votre Honda Civic 2019 est confirmé pour le lundi 16 septembre à 10 h 00. Au plaisir de vous voir!",
        button: "Ajouter au calendrier",
      },
      invoice: {
        shopName: "RIVERSIDE AUTO",
        invoiceLabel: "Facture #1034",
        billTo: "Facturé à",
        client: "James Carter",
        email: "jamescarter@gmail.com",
        vehicleLabel: "Honda Civic 2019 · NIV : 2HGFC2F79KH123456",
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
      heading: "Conçu pour les garages indépendants. Prêt pour la suite.",
      description:
        "Que vous soyez seul dans votre atelier ou à la tête de plusieurs baies, GarageOS grandit avec vous. On est là pour vous aider à bâtir une meilleure entreprise — aujourd'hui et demain.",
      cta: "Commencer",
      quote: "Un outil moderne pour de vrais mécaniciens.",
      quoteAuthor: "L'équipe GarageOS",
    },
    testimonials: {
      eyebrow: "Les propriétaires d'ateliers aiment GarageOS",
      heading: "De vrais ateliers. De vrais résultats.",
      items: [
        {
          quote:
            "Je suis passé des feuilles de calcul et des post-it à tout avoir au même endroit. Ça change tout.",
          name: "Steve L.",
          shop: "Lachine Mécanique",
        },
        {
          quote:
            "Notre communication avec les clients est tellement meilleure maintenant. Les courriels et rapports d'inspection à notre image sont impeccables.",
          name: "Caroline D.",
          shop: "Performance Auto",
        },
        {
          quote:
            "Simple à utiliser, très puissant, et l'équipe de soutien écoute vraiment. Je recommande fortement.",
          name: "Daniel R.",
          shop: "Atelier 514",
        },
      ],
      shopNames: ["Performance Auto", "Lachine Mécanique", "ATELIER 514", "RPM GARAGE", "Riverside Auto"],
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
            "Rendez-vous et ordres de travail",
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
      heading: "Rejoignez des centaines de garages qui utilisent déjà GarageOS.",
      description: "Configurez votre atelier en quelques minutes. Aucune carte de crédit requise.",
      cta: "Commencer",
    },
    footer: {
      tagline: "Le système d'exploitation des ateliers mécaniques modernes.",
      columns: {
        product: {
          title: "Produit",
          links: [
            { label: "Fonctionnalités", href: "/features" },
            { label: "Tarifs", href: "/#pricing" },
            { label: "Intégrations", href: "/integrations" },
            { label: "Nouveautés", href: "/changelog" },
          ],
        },
        resources: {
          title: "Ressources",
          links: [
            { label: "Centre d'aide", href: "/help" },
            { label: "Blogue", href: "/blog" },
            { label: "Guides", href: "/guides" },
            { label: "Contact", href: "/contact" },
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
