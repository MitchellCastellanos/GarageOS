export function conversionCopy(locale: string) {
  return locale === "fr" ? {
    title: "Convertir en client", ownerName: "Nom du propriétaire", ownerEmail: "Courriel du propriétaire", plan: "Plan final", interval: "Facturation",
    monthly: "Mensuelle", yearly: "Annuelle · 10 mois pour 12", stays: "Le même atelier conserve son logo, ses photos, sa configuration, ses services, ses horaires, sa page de réservation et ses données préparées.",
    retain: "Conserver les données du scénario explicitement marqué (le cas échéant). Vous pourrez les gérer après l’activation.",
    send: "Envoyer le lien d’activation", resend: "Renvoyer l’activation", sent: "Activation envoyée. La conversion attend la confirmation de Stripe.",
    cooldown: "Attendez une minute avant de renvoyer ou de modifier l’activation. Les informations déjà envoyées restent en vigueur.", pending: "Traitement en cours…", error: "Impossible de terminer. Vérifiez le compte propriétaire ou réessayez. Aucun changement de propriétaire ne sera effectué en cas de conflit.",
    ready: "Votre GarageOS est prêt", activate: "Activer mon compte GarageOS", password: "Choisissez votre mot de passe", passwordHint: "Au moins 8 caractères. Vous seul choisissez ce mot de passe.",
    existing: "Ce compte existe déjà dans cet atelier. Connectez-vous à votre compte pour accepter l’activation.", login: "Se connecter", invalid: "Ce lien est invalide, expiré, remplacé ou déjà utilisé. Demandez un nouveau lien à votre représentant. Si vous avez déjà activé votre compte, connectez-vous pour terminer le paiement.",
    almost: "Vous y êtes presque", payment: "Votre plan est présélectionné. Terminez le paiement sécurisé dans Stripe pour démarrer GarageOS.",
    confirming: "Confirmation du paiement auprès de Stripe…", unconfirmed: "Le paiement n’est pas encore confirmé. Réessayez la confirmation ou revenez plus tard.", retry: "Vérifier le paiement", dashboard: "Ouvrir le tableau de bord",
  } : {
    title: "Convert to customer", ownerName: "Owner name", ownerEmail: "Owner email", plan: "Final plan", interval: "Billing",
    monthly: "Monthly", yearly: "Annual · 10 months for 12", stays: "The same shop keeps its logo, photos, configuration, services, hours, Booking Page and prepared records.",
    retain: "Keep the explicitly marked scenario records (if present). You can manage them after activation.",
    send: "Send activation link", resend: "Resend activation", sent: "Activation sent. Conversion awaits confirmation from Stripe.",
    cooldown: "Wait one minute before resending or changing activation. The previously sent details still apply.", pending: "Working…", error: "Unable to finish. Check the owner account or retry. Account conflicts never change ownership.",
    ready: "Your GarageOS is ready", activate: "Activate my GarageOS account", password: "Choose your password", passwordHint: "At least 8 characters. Only you choose this password.",
    existing: "This account already belongs to this shop. Sign in to your account to accept activation.", login: "Sign in", invalid: "This link is invalid, expired, replaced or already used. Ask your salesperson for a new link. If you have already activated, sign in to finish payment.",
    almost: "You’re almost done", payment: "Your plan is preselected. Complete secure payment in Stripe to start GarageOS.",
    confirming: "Confirming payment with Stripe…", unconfirmed: "Payment has not been confirmed yet. Retry confirmation or return later.", retry: "Check payment", dashboard: "Open Dashboard",
  };
}
