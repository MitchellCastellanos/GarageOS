export type ResourceArticle = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  sections: { title: string; body: string; steps?: string[] }[];
  relatedGuide?: string;
  /** Extra contextual links shown under a blog post (EN only; the blog has no FR version). */
  relatedLinks?: { label: string; href: string }[];
};

// Documentation follows the implemented shop workflows, not a future roadmap.
export const GUIDES: ResourceArticle[] = [
  {
    slug: "set-up-your-shop", title: "Set up your shop and team", category: "Getting started",
    summary: "Prepare your shop details, branding and team access before your first appointment.",
    sections: [
      { title: "Start from your account", body: "Create your account and confirm your email address. During setup you choose a plan and add a payment method to start the 14-day free trial ($0 today; billing starts automatically after the trial unless you cancel). The setup guide also walks you through your shop details, tax number and logo, services, opening hours and booking page color. Team members sign in with the account the Owner created for them. Most Settings tabs and team actions are for the Owner only: other roles see just the General tab and cannot save changes, so if something is missing, ask the shop Owner." },
      { title: "Check the details customers will see", body: "Open Settings and review the General tab before sending documents. Each section has its own Save changes button.", steps: ["Check the shop name, address, phone number and Main email. Customers' replies to messages sent from GarageOS go to the Main email once you have confirmed it.", "Add your shop logo (JPG, PNG, WebP or SVG, up to 4 MB). It appears on every PDF invoice.", "Enter your tax number and check the Taxes section. The rates apply to new invoices and quotes; invoices already issued keep the taxes they were issued with.", "Open the Booking page tab to review how your public booking page looks, then open the page and a PDF document to confirm the details."] },
      { title: "Give each person their own access", body: "Open Settings → Team and choose New user. Enter the person's full name, email, a temporary password (at least 8 characters) and a role, then select Create account. The roles are Owner (full access), Mechanic (can create and edit) and Read only (view without editing). Core includes up to 3 users; Pro and Complete have no user limit and also let the Owner adjust an individual's permissions. Give each person their own account so they have the access their work requires. If an action is missing for someone, ask the Owner to check their role instead of sharing the Owner login." },
      { title: "Prepare for the first booking", body: "In Settings → Calendar & Hours, review your opening hours, booking rules and the mechanics who can receive appointments; the shop timezone is shown there too. In Settings → Services, check the services customers can choose. Then add a client and vehicle before creating your first appointment. Having the customer record ready makes later estimates and invoices easier to connect." },
    ],
  },
  {
    slug: "configure-online-booking", title: "Configure online booking", category: "Appointments",
    summary: "Set opening hours, available mechanics and the booking window customers can use.",
    sections: [
      { title: "Before you begin", body: "Online booking is configured by the shop Owner. You also need a shop identifier, which creates your public booking link; set it under Public booking link in Settings → Booking page. Your booking page belongs to your shop and shows its branding. Copy the link from Settings → Calendar & Hours before sharing it with customers." },
      { title: "Set the booking rules", body: "Open Settings → Calendar & Hours. Each card below has its own save button.", steps: ["Turn on Accept online appointments when the shop is ready to take bookings. This switch saves immediately, and turning it off stops new bookings through your link and the embedded form.", "Under Booking rules, set Duration of each appointment (min), which is also how often start times are offered, plus Minimum lead time (hours) and Bookable up to (days ahead). Then select Save web booking settings.", "Under Opening hours, set opening and closing times for each day and mark days off as Closed, then select Save hours.", "Under Mechanics available for appointments, tick Receives web bookings for each mechanic who should take online appointments. Use Schedule to give a mechanic their own hours (otherwise they follow the shop's hours) and save their schedule.", "Select Open booking page and check the offered times for a working day."] },
      { title: "Why a time may not appear", body: "A time must fit within the shop and mechanic working hours, satisfy the minimum lead time and leave enough time for the service, using the length set for that service in Settings → Services. At least one mechanic must have Receives web bookings ticked, and existing appointments can remove available slots. Online booking also pauses if the shop's subscription is not active. Check these conditions before increasing availability; changing the interval between start times alone does not create capacity." },
      { title: "Follow up after a booking", body: "A web booking is created straight away as a confirmed appointment, marked Web in the Appointments calendar; there is no request to approve. Open it and confirm its client, vehicle, service and assigned mechanic. The customer is confirmed by SMS first when your shop has SMS turned on and they gave a phone number, with email as the backup; a client's own How to notify them setting can change that. Your team is alerted too (see Internal team alerts in Settings → Notifications). Open the appointment's History to see which notice the customer received instead of assuming that a saved appointment guarantees a delivered message." },
    ],
  },
  {
    slug: "clients-and-vehicles", title: "Keep client and vehicle records organized", category: "Client records",
    summary: "Create a reliable customer record and connect vehicles before preparing service documents.",
    sections: [
      { title: "Search before adding a client", body: "Open Clients and search for the customer first. You can search by name, email, phone or a vehicle's plate, make or model. Compare their contact details before creating another record, because GarageOS does not stop you from adding a duplicate. Reusing the existing record keeps vehicle and document history together." },
      { title: "Build the record", body: "Open an existing client or select New client.", steps: ["Enter the name or company and the phone number, plus email, address and internal notes if you have them. Leave Last name blank for a company.", "Choose the customer's Preferred language (used for their SMS and email) and How to notify them: Automatic (SMS first, email as backup), Prefer SMS, Prefer email or Always both.", "On the client's page, select Add vehicle. Make, model, year and license plate are required; the other identifying fields, such as color and mileage unit, are optional.", "Verify the selected vehicle when creating an appointment, quote or invoice."] },
      { title: "Keep history useful", body: "Use clear service descriptions that another team member can understand. Before a return visit, open the client page to see recent invoices and the vehicle page to see its service history, active reminders and work orders. Update changed contact information (Edit on the client page) before sending a new estimate or invoice." },
      { title: "Correct mistakes carefully", body: "If you find duplicate clients or the wrong vehicle on a draft document, confirm the correct record before editing. Avoid deleting records that have service history simply to tidy a list: deleting a client permanently removes their vehicles and history, deleting a vehicle removes its service history, and neither can be undone. Users with the Read only role cannot edit client records, so ask the shop Owner to make any correction your role does not allow." },
    ],
  },
  {
    slug: "estimate-to-invoice", title: "From estimate to invoice", category: "Estimates & invoices",
    summary: "Prepare an estimate, record the customer's decision and follow the invoice through payment.",
    sections: [
      { title: "Prepare a clear estimate", body: "Open Estimates and create a draft for the correct client and vehicle. Add the service and parts lines, quantities and prices. Review totals and shop details before sending. Draft estimates can be edited; review them before moving to a later status." },
      { title: "Record the customer's decision", body: "When you send an estimate, the customer receives a secure link. They enter their name and choose to accept or reject. The link can be used once and expires, and your team is notified of the decision. Open the estimate afterward and check its status: sending an estimate does not mean it was approved. If the customer answers by phone or in person instead, open the sent estimate and use the Accepted or Rejected button to update its status yourself; this changes the status only, it does not store the customer's name or a copy of what they saw. Note who approved what, and when, in your own shop records." },
      { title: "Create and review the invoice", body: "Use the estimate's conversion action when you are ready to invoice.", steps: ["Open the resulting draft invoice and check the client and vehicle.", "Review each line, totals and notes before sending.", "Send the invoice by email or text, or download its PDF.", "Check the send result and correct recipient details if delivery fails."] },
      { title: "Record a received payment", body: "After payment is received, use the invoice payment action to record the applicable method and amounts. Recording a card payment in GarageOS is a record of a payment collected through your shop's payment process; it does not charge a card. Review the payment record and any receipt before closing out the job." },
    ],
  },
  {
    slug: "approval-history", title: "Understand estimate approvals", category: "Estimates & invoices",
    summary: "What happens to an estimate when a customer responds, and what you can and cannot see afterward.",
    sections: [
      { title: "What happens when a customer responds", body: "A customer can accept or reject an estimate from its secure link. The estimate's status changes to Accepted or Rejected, the link stops working and your team is notified. GarageOS also keeps an internal record of the decision, but the shop interface does not currently show an approval-history screen or a copy of what the customer saw." },
      { title: "Check an estimate's status", body: "Open the estimate to see whether it is Draft, Sent, Accepted or Rejected. Use this as your working status for the job. Do not rely on it to show who responded, when they responded or what exact version they approved." },
      { title: "Keep your own proof for important approvals", body: "For larger jobs, keep the sent estimate (PDF or email) and a note of the customer's reply in your own records. If the scope or price changes after a response, send a new estimate or confirm the change with the customer before starting the extra work, because an earlier approval does not cover added work." },
    ],
  },
  {
    slug: "maintenance-reminders", title: "Set up and manage maintenance reminders", category: "Communicate & retain",
    summary: "Attach a future service need to a vehicle so the next visit doesn't get forgotten.",
    sections: [
      { title: "Create a reminder", body: "Open Reminders and create one for the relevant vehicle.", steps: ["Choose the service type the vehicle will need.", "Set a due date, a due mileage, or both.", "Add any notes the team should see when the reminder comes due."] },
      { title: "Send a reminder", body: "Basic reminders are emailed automatically about a week before the due date. To send one earlier, open the pending reminder and use Send; this needs an email address on the client and works once per reminder. On Pro and Complete, reminder rules can create the next reminder for you when a matching job is completed. A saved reminder is not a delivered message, so check that its status changes to Sent." },
      { title: "Review reminder status", body: "Use the Pending, Sent and Dismissed tabs on the Reminders page. Pending means it has not been sent yet; Sent means GarageOS emailed it. Dismiss a reminder you no longer need, for example when the customer already booked. GarageOS does not record whether the customer replied, so follow up through your normal channels." },
    ],
  },
  {
    slug: "manage-inventory", title: "Manage inventory and stock adjustments", category: "Run the shop",
    summary: "Keep part quantities accurate as they're used on jobs and restocked (Pro and Complete).",
    sections: [
      { title: "Add a part", body: "Inventory is included in Pro and Complete. Open Inventory and select New part. Enter the name, an optional SKU (unique within your shop), description, unit cost and sale price, the starting quantity you have on hand today, and a reorder point. Parts at or below their reorder point are flagged Low stock." },
      { title: "Record stock movements", body: "Open a part and use Adjust stock to record a movement. The types are Stock received, Manual adjustment, Used on a job and Return.", steps: ["Record Stock received when a shipment arrives.", "Pick the stocked part on a work order line and its quantity comes off inventory automatically (editing or cancelling the work order puts it back). Use Used on a job only for usage that is not on a work order.", "Use Manual adjustment (a negative number subtracts) to correct a count. GarageOS will not let a movement take stock below zero.", "Review the Movement history if a quantity looks wrong."] },
      { title: "Keep counts trustworthy", body: "Reconcile quantities periodically against a physical count, recording any difference as a Manual adjustment with a note. Accurate stock makes it easier to know what to reorder before a job is held up waiting on a part." },
    ],
  },
  {
    slug: "multi-location", title: "Run multiple locations with Multi-Shop", category: "Run the shop",
    summary: "Add locations under one organization, switch between them and compare results (Complete plan).",
    sections: [
      { title: "Before you begin", body: "Multi-Shop is included in the Complete plan. Only the Owner of the main location can manage the organization: adding locations and deciding which team members can access each one." },
      { title: "Add a location", body: "Open Organization in the menu.", steps: ["Enter the new location's name and select Add location (the first time the button reads Create organization and location). Your current shop stays the main location, and its logo, brand color and tax details are copied to the new one.", "Open Settings → Locations and use Give access to to add team members. Staff accounts are created under Settings → Team first.", "Select Switch to this location and finish its short setup (shop details, services, hours and your booking link)."] },
      { title: "Switch between locations", body: "Use the location pill in the top bar (shown on larger screens when you can access more than one location) or Switch to this location on the Organization page. The active location is marked Active now, and everything you see and create belongs to it." },
      { title: "Keep records separated", body: "Each location keeps its own customers, vehicles, appointments, Work Orders, invoices and inventory. Team members only see the locations they've been given access to." },
      { title: "Compare and consolidate", body: "In Reports, use the Location filter to choose the active location, a single location or All my locations, and open the Locations report (also Compare locations on the Organization page) to compare invoices, revenue, refunds, open work orders and new customers side by side. Consolidated reports respect each person's permissions." },
    ],
  },
  {
    slug: "digital-vehicle-inspections", title: "Run a digital vehicle inspection", category: "Inspect & authorize",
    summary: "Record findings on a checklist and turn them into a draft quote; add photos and share a report on Pro.",
    sections: [
      { title: "Start an inspection", body: "Open Inspections and select New inspection. Choose the client and vehicle (you can also record who performed it, link a work order and add the mileage), then select Start inspection. Every plan starts from the standard checklist (tires, brakes, battery, lights, fluids, wipers, suspension, exhaust, belts and hoses, mirrors and glass); Pro and Complete can choose your own reusable templates instead, built under Templates." },
      { title: "Record what you find", body: "For each item, set the condition and add a note.", steps: ["Mark each item Good, Attention or Service required.", "Add custom items for anything the checklist doesn't cover.", "On Pro and Complete, select Add photo on the items that matter.", "Select Create quote from findings to start a draft quote with a line for each item marked Attention or Service required. The lines have no prices yet, so add them in the quote editor before sending."] },
      { title: "Share the report (Pro and Complete)", body: "In the Customer report card, select Create shareable link and copy it. The mobile-friendly report opens without signing in, in the client's preferred language: findings come first with their notes and photos, followed by the full checklist. Select Stop sharing at any time and the old link stops working." },
    ],
  },
  {
    slug: "work-orders", title: "Work Orders and job status", category: "Run the shop",
    summary: "Turn approved work into a Work Order, track the job and let the customer know when it's ready.",
    sections: [
      { title: "Create the Work Order", body: "Open Work orders and select New work order, or open an accepted quote and select Create work order (one is created per vehicle, already marked Approved). Enter the client, the vehicle and the customer concern, add the labour and parts lines (you can leave them empty and fill them in during diagnosis), and choose an assigned technician." },
      { title: "Track the job", body: "A work order has two statuses. The shop workflow moves from Open through Awaiting approval, Approved and In progress to Completed using the buttons Send for approval, Approve, Start work and Mark completed (Cancel order is also available). Separately, the Customer-facing status moves the job through Checked in, Awaiting approval, Waiting on parts, In service, Ready for pickup and Picked up, and is what customers see in their portal. The front desk sees both without asking the shop floor." },
      { title: "Parts and inventory (Pro and Complete)", body: "Inventory is included in Pro and Complete. Pick a stocked part in the Inventory part field of a line and its quantity comes off inventory when the work order is saved. Editing the quantity, swapping the part, cancelling or deleting the work order adjusts stock, and GarageOS refuses to use stock you don't have." },
      { title: "Ready for pickup", body: "When you set the Customer-facing status to Ready for pickup, the customer is notified once, by SMS or email, depending on the notification options in Settings → Notifications and the customer's contact details and preferences. Once the work order is Completed, the Invoice button creates a draft invoice from its lines." },
    ],
  },
  {
    slug: "customer-portal", title: "Give customers their portal link", category: "Communicate & retain",
    summary: "A secure link where customers see their vehicles, estimates, invoices and history — included in every plan.",
    sections: [
      { title: "What customers see", body: "Their vehicles and service history, upcoming appointments, jobs in the shop with their status, estimates they can review and answer, invoices with a PDF download, inspection reports you've shared, and upcoming reminders. It carries your shop's logo and colors and is designed to work on a phone." },
      { title: "Send a link", body: "Open the customer and use the Customer portal card.", steps: ["Select Email portal link to send it to the address on file, or Create link to copy to copy a new link and text it yourself. A copied link is shown only once.", "Links expire after 30 days and only the latest five stay active.", "Select Revoke all links on the same card if a customer loses their phone or asks you to. Users with the Read only role can see the card but not change links."] },
      { title: "Customers can ask for their own link", body: "Customers can request a fresh link on your shop's portal page, or from the Email me a new link button on an expired link. It is only ever emailed to the address you have on file, requests are limited per hour, and the page never reveals whether an email belongs to a customer." },
    ],
  },
  {
    slug: "import-your-data", title: "Import customers and vehicles", category: "Getting started",
    summary: "Bring your data over from CSV or Excel with a preview before anything is saved.",
    sections: [
      { title: "Prepare your file", body: "Export customers (and their vehicles) from your previous system as a .csv or .xlsx (Excel) file of up to 4 MB, with the column names in the first row. One row per vehicle works well: each row carries its owner's email, phone or name. Importing is limited to the Owner by default." },
      { title: "Import in three steps", body: "Open Import data. If some rows have errors, fix them in your file and import it again; duplicates are skipped safely.", steps: ["File: choose what you are importing (Customers, Vehicles or, on Pro and Complete, Inventory), pick the file and select Read file.", "Map columns: your columns are matched automatically, so check each field and fix anything that is off. Choose what to do if a record already exists (skip it, or on Pro and Complete update it with the file's non-empty values) and whether to create a customer when a vehicle's owner is not found. Then select Validate file.", "Review & import: nothing has been imported yet. Check the counts and the rows with errors, use Download rows with errors (CSV) to fix them, then select Import now."] },
      { title: "Limits by plan", body: "Every plan can import customers and vehicles (up to 500 rows per file). Pro and Complete also import inventory and larger files (up to 10,000 rows)." },
    ],
  },
  {
    slug: "branded-communications", title: "Configure branded customer communications", category: "Communicate & retain",
    summary: "Set up mailboxes, a sending domain and routing so messages go out under your shop's identity.",
    sections: [
      { title: "Before you begin", body: "Only the shop Owner can change these settings. Every plan sends from a GarageOS address built from your shop identifier, so set the identifier first (Settings → Booking page). A custom email domain and extra sending addresses are included in Pro and Complete." },
      { title: "Set up delivery", body: "Open Settings → Domain & Email (also reached from Email & domain in the menu).", steps: ["Under Your email sender, check the address your appointment, invoice, quote and message emails go out from. On Core this is a GarageOS address and the card links to where you set your identifier.", "On Pro and Complete, enter your domain under Custom domain for your emails, select Register domain, add the DNS records shown at your domain provider, then select Verify.", "Under Your addresses, select New address to add sending addresses on your domain. A new address must start with your shop identifier.", "Under Automatic rules, choose which address each type of automatic email or SMS uses, or use Customize by type."] },
      { title: "Confirm it's working", body: "Send a test message through a real workflow, such as an appointment confirmation or estimate, and check the delivery result before relying on it for customers. Addresses on your own domain work only once the domain shows Verified. Customers' replies go to the Main email in Settings → General once that email is confirmed." },
    ],
  },
];

export const BLOG_POSTS: ResourceArticle[] = [
  {
    slug: "a-clearer-start-to-the-shop-day", title: "A clearer start to the shop day", category: "Shop operations",
    summary: "A short morning review helps the front desk and workshop work from the same information.", relatedGuide: "configure-online-booking",
    relatedLinks: [{ label: "Online booking for auto repair shops", href: "/features/online-booking" }],
    sections: [
      { title: "Start with the calendar", body: "Before the first vehicle arrives, review today's appointments with the people handling reception and repairs. Check the service requested, the assigned mechanic and missing customer details. A calendar entry is a starting point, but the team still needs to know whether the vehicle is arriving, already on site or waiting for a customer response." },
      { title: "Check capacity before promising a time", body: "A gap between appointments is not always enough time for another service. Consider service duration and the mechanic's working hours before offering it. In GarageOS, online availability uses the shop's booking rules and mechanic schedules. Keeping those settings accurate helps the public booking page reflect the time the shop can actually offer." },
      { title: "Make the handoff specific", body: "Replace a vague note such as 'customer called' with the issue that needs attention: verify the phone number, confirm the requested service or review an estimate with the customer. Keep the relevant client and vehicle attached to the appointment so the next person can find the same record without starting a new one." },
      { title: "Close the loop at the end of the day", body: "Before leaving, review appointments that need follow-up and documents still awaiting a customer decision or payment. Record the current state while the details are fresh. Tomorrow's team should be able to identify the next action from the record instead of relying on whoever remembers the conversation." },
    ],
  },
  {
    slug: "estimates-customers-can-understand", title: "Write estimates customers can understand", category: "Customer communication",
    summary: "Clear descriptions and an explicit decision make the transition from estimate to invoice easier to follow.", relatedGuide: "estimate-to-invoice",
    relatedLinks: [{ label: "Quotes and approvals", href: "/features/quotes-and-approvals" }],
    sections: [
      { title: "Name the work, then show the cost", body: "Write line descriptions that explain what the shop proposes to do. A specific service description is more useful than a generic 'repair' label. Review quantities, unit prices and totals before sending so the customer can connect the proposed work with the amount they are being asked to approve." },
      { title: "Check who and what the estimate is for", body: "Before sending, verify the customer, vehicle and recipient email. This matters when a customer owns several vehicles or when two customers have similar names. Reusing the correct record also keeps later service documents attached to the right history." },
      { title: "Keep delivery and acceptance separate", body: "An estimate being sent tells the team it has been shared. It does not tell them the customer agreed. After discussing the work through your shop's normal process, record the customer's decision in GarageOS. If the proposed scope changes, clarify the revised work with the customer before proceeding." },
      { title: "Review the final invoice", body: "Converting an estimate reduces re-entry, but the resulting draft still deserves a review. Confirm that its lines match the work being invoiced. Once payment has been received, record it against the invoice so the document and payment history tell a consistent story." },
    ],
  },
  {
    slug: "useful-vehicle-history", title: "Make vehicle history useful at the next visit", category: "Client records",
    summary: "Consistent records help the next person understand what happened without reconstructing the job.", relatedGuide: "clients-and-vehicles",
    relatedLinks: [{ label: "Digital vehicle inspections", href: "/features/digital-vehicle-inspections" }, { label: "Set up maintenance reminders", href: "/help/communicate-and-retain/maintenance-reminders" }],
    sections: [
      { title: "One customer, the right vehicles", body: "Start by searching for an existing customer. Creating a new record for each visit splits useful history across several places. Confirm the identifying details of the vehicle instead of choosing by make alone, especially for households or businesses that bring in several similar vehicles." },
      { title: "Write for the next person", body: "A service description should make sense to someone who did not handle the appointment. Record the work clearly and keep relevant documents associated with the correct customer and vehicle. Avoid relying on private shorthand that only one mechanic understands." },
      { title: "Review history before the conversation", body: "When a customer returns, review their associated estimates and invoices before preparing a new document. This gives the conversation context and makes it easier to distinguish work previously proposed from work actually invoiced. Use the record as a starting point and confirm the current request with the customer." },
      { title: "Keep contact details current", body: "A complete history is less helpful if the next estimate goes to an old address. Confirm email, phone and communication preferences when they change. Treat record maintenance as part of the service handoff: the next appointment should begin with information the team can use." },
    ],
  },
];
