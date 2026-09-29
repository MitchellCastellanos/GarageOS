export type ResourceArticle = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  sections: { title: string; body: string; steps?: string[] }[];
  relatedGuide?: string;
};

// Documentation follows the implemented shop workflows, not a future roadmap.
export const GUIDES: ResourceArticle[] = [
  {
    slug: "set-up-your-shop", title: "Set up your shop and team", category: "Getting started",
    summary: "Prepare your shop details, branding and team access before your first appointment.",
    sections: [
      { title: "Start from your account", body: "Create your account, choose your plan to start the 14-day free trial ($0 today), then follow the setup steps. Invited team members sign in with the login the owner created for them. Settings and team actions depend on your role — if something is missing, ask the shop owner to check it." },
      { title: "Check the details customers will see", body: "Open Settings and review the shop information before sending documents.", steps: ["Check the shop name, address, phone number and contact email.", "Add your shop logo and review the branding options.", "Check the timezone and invoice settings for your shop.", "Save your changes and review a document or your public booking page to confirm the details."] },
      { title: "Give each person their own access", body: "Use team management to add staff and assign the appropriate role. Use individual accounts so each person has the access their work requires. If an action is missing, have an administrator check the role instead of sharing an administrator password." },
      { title: "Prepare for the first booking", body: "Review opening hours, booking settings and the mechanics who can receive appointments. Then add a client and vehicle before creating your first appointment. Having the customer record ready makes later estimates and invoices easier to connect." },
    ],
  },
  {
    slug: "configure-online-booking", title: "Configure online booking", category: "Appointments",
    summary: "Set opening hours, available mechanics and the booking window customers can use.",
    sections: [
      { title: "Before you begin", body: "You need access to shop settings and a configured public shop address. Your booking page belongs to your shop and shows its branding. Ask your administrator for the correct address before sharing it with customers." },
      { title: "Set the booking rules", body: "In Settings, open the website appointment booking section.", steps: ["Enable online booking when the shop is ready to receive requests.", "Set the interval between offered start times, minimum advance notice and how far ahead customers can book.", "Set opening and closing times for each day, marking days off as closed.", "Choose the mechanics available for appointments and check their individual working hours.", "Save the settings, then open the public page and check the offered times for a working day."] },
      { title: "Why a time may not appear", body: "A time must fit within the shop and mechanic working hours, satisfy the advance-notice rules and leave enough time for the service. Existing appointments can remove available slots. Check these conditions before increasing availability; changing the start-time interval alone does not create capacity." },
      { title: "Follow up after a booking", body: "Review the appointment in the shop calendar and confirm its client, vehicle, service and assigned mechanic. Customers are notified by email and, when you have a shop number, by text. Check the result of a send action instead of assuming that a saved appointment guarantees a delivered message." },
    ],
  },
  {
    slug: "clients-and-vehicles", title: "Keep client and vehicle records organized", category: "Client records",
    summary: "Create a reliable customer record and connect vehicles before preparing service documents.",
    sections: [
      { title: "Search before adding a client", body: "Open Clients and search for the customer first. Compare their contact details before creating another record. Reusing the existing record keeps vehicle and document history together." },
      { title: "Build the record", body: "Open an existing client or create a new one.", steps: ["Check the customer name, email and phone number.", "Choose the customer's preferred communication language where available.", "Add the vehicle under that client and fill in the identifying information you have.", "Verify the selected vehicle when creating an appointment, estimate or invoice."] },
      { title: "Keep history useful", body: "Use clear service descriptions that another team member can understand. Before a return visit, open the client and vehicle records to review associated documents. Update changed contact information before sending a new estimate or invoice." },
      { title: "Correct mistakes carefully", body: "If you find duplicate clients or the wrong vehicle on a draft document, confirm the correct record before editing. Avoid deleting records that have service history simply to tidy a list. Ask the shop administrator to review any correction you cannot make with your role." },
    ],
  },
  {
    slug: "estimate-to-invoice", title: "From estimate to invoice", category: "Estimates & invoices",
    summary: "Prepare an estimate, record the customer's decision and follow the invoice through payment.",
    sections: [
      { title: "Prepare a clear estimate", body: "Open Estimates and create a draft for the correct client and vehicle. Add the service and parts lines, quantities and prices. Review totals and shop details before sending. Draft estimates can be edited; review them before moving to a later status." },
      { title: "Record the customer's decision", body: "Send the estimate by email or text. The customer opens a secure page (or their customer portal) and accepts or declines, and GarageOS records the decision. If they answer another way, record the decision yourself. Sending the estimate does not by itself mean the customer has approved it." },
      { title: "Create and review the invoice", body: "Use the estimate's conversion action when you are ready to invoice.", steps: ["Open the resulting draft invoice and check the client and vehicle.", "Review each line, totals and notes before sending.", "Send the invoice by email or text, or download its PDF.", "Check the send result and correct recipient details if delivery fails."] },
      { title: "Record a received payment", body: "After payment is received, use the invoice payment action to record the applicable method and amounts. Recording a card payment in GarageOS is a record of a payment collected through your shop's payment process; it does not charge a card. Review the payment record and any receipt before closing out the job." },
    ],
  },
  {
    slug: "approval-history", title: "Understand estimate approval history", category: "Estimates & invoices",
    summary: "Every recorded decision keeps a traceable record you can review later.",
    sections: [
      { title: "Why the record matters", body: "When you record a customer's decision on an estimate, GarageOS keeps a timestamped entry of the decision, the channel it came through and a snapshot of what was approved. This gives you a reference if a customer later asks what they agreed to." },
      { title: "Review a past approval", body: "Open the estimate and review its recorded decisions.", steps: ["Confirm the decision (accepted or rejected) and when it was recorded.", "Compare the approved snapshot with the current estimate if it was edited afterward.", "Use the record to resolve any disagreement about what was approved."] },
      { title: "Keep the trail clean", body: "Record a new decision rather than editing an old one if the scope changes after approval — this keeps each decision tied to what the customer actually saw at the time." },
    ],
  },
  {
    slug: "maintenance-reminders", title: "Set up and manage maintenance reminders", category: "Communicate & retain",
    summary: "Attach a future service need to a vehicle so the next visit doesn't get forgotten.",
    sections: [
      { title: "Create a reminder", body: "Open Reminders and create one for the relevant vehicle.", steps: ["Choose the service type the vehicle will need.", "Set a due date, a due mileage, or both.", "Add any notes the team should see when the reminder comes due."] },
      { title: "Send a reminder", body: "Basic reminders are sent by email a week before the due date, or you can send one from the reminder. On Pro and Complete, reminder rules create the next reminder automatically when you complete a matching job and send it by the customer's preferred channel. Check the delivery result the same way you would for an estimate or invoice — a saved reminder does not guarantee a delivered message." },
      { title: "Track reminder status", body: "Reminders move from pending to sent, and can be marked acknowledged once the customer responds or dismissed if no longer needed. Review pending reminders regularly so follow-ups don't pile up." },
    ],
  },
  {
    slug: "manage-inventory", title: "Manage inventory and stock adjustments", category: "Run the shop",
    summary: "Keep part quantities accurate as they're used on jobs and restocked.",
    sections: [
      { title: "Add a part", body: "Open Inventory and create a part record with the details your team needs to identify it, along with its current quantity." },
      { title: "Record stock movements", body: "Adjust quantities as parts come in or get used.", steps: ["Record incoming stock when a shipment arrives.", "Record usage when a part is consumed on a job. On Pro and Complete, pick the stocked part on a Work Order line and its quantity comes off inventory automatically (editing or cancelling the Work Order puts it back).", "Review the movement history if a quantity looks wrong."] },
      { title: "Keep counts trustworthy", body: "Reconcile quantities periodically against a physical count. Accurate stock makes it easier to know what to reorder before a job is held up waiting on a part." },
    ],
  },
  {
    slug: "multi-location", title: "Run multiple locations with Multi-Shop", category: "Run the shop",
    summary: "Add locations under one organization, switch between them and compare results (Complete plan).",
    sections: [
      { title: "Before you begin", body: "Multi-Shop is included in the Complete plan. The owner of the main location administers the organization: adding locations and deciding which team members can access each one." },
      { title: "Add a location", body: "Open Organization in the menu.", steps: ["Enter the new location's name and add it — your current shop stays the main location.", "Open Settings → Locations to give team members access to it.", "Switch to the new location and finish its short setup (hours, services, booking)."] },
      { title: "Switch between locations", body: "Use the location pill in the top bar or the Organization page to switch. The active location is always shown, and everything you see and create belongs to it." },
      { title: "Keep records separated", body: "Each location keeps its own customers, vehicles, appointments, Work Orders, invoices and inventory. Team members only see the locations they've been given access to." },
      { title: "Compare and consolidate", body: "In Reports, choose all locations or a single one, and open the Locations report to compare sales, jobs and new customers side by side. Consolidated reports respect each person's permissions." },
    ],
  },
  {
    slug: "digital-vehicle-inspections", title: "Run a digital vehicle inspection", category: "Inspect & authorize",
    summary: "Record findings on a checklist and turn them into an estimate; add photos and share a report on Pro.",
    sections: [
      { title: "Start an inspection", body: "Open Inspections and create one for the customer's vehicle. Every plan starts from the standard checklist; Pro and Complete can use your own reusable templates instead." },
      { title: "Record what you find", body: "For each item, set the condition and add a note.", steps: ["Mark each item Good, Needs attention or Service required.", "Add custom items for anything the checklist doesn't cover.", "On Pro and Complete, attach photos to the findings that matter.", "Create an estimate from the findings to price the recommended work."] },
      { title: "Share the report (Pro and Complete)", body: "Share a link to the customer-friendly report — findings first, then photos and the full checklist. You can stop sharing at any time and the old link stops working." },
    ],
  },
  {
    slug: "work-orders", title: "Work Orders and job status", category: "Run the shop",
    summary: "Turn approved work into a Work Order, track the job and let the customer know when it's ready.",
    sections: [
      { title: "Create the Work Order", body: "Open Work Orders and create one from an approved estimate, or start one directly. Add the customer's concern, the vehicle, and the service and parts lines, and assign a mechanic." },
      { title: "Track the job", body: "Move the job through its status — checked in, waiting for approval, waiting for parts, in service and ready for pickup. The front desk sees the status without asking the shop floor." },
      { title: "Parts and inventory (Pro and Complete)", body: "Pick a stocked part on a line and its quantity comes off inventory automatically. Editing the quantity, swapping the part or cancelling the Work Order adjusts stock, and GarageOS refuses to use stock you don't have." },
      { title: "Ready for pickup", body: "When the job is ready, the customer is notified by email or text according to your shop's settings, and the invoice can be created straight from the Work Order." },
    ],
  },
  {
    slug: "customer-portal", title: "Give customers their portal link", category: "Communicate & retain",
    summary: "A secure link where customers see their vehicles, estimates, invoices and history — included in every plan.",
    sections: [
      { title: "What customers see", body: "Their vehicles and service history, upcoming appointments, jobs in the shop with their status, estimates they can review and answer, invoices with a PDF download, inspection reports you've shared, and upcoming reminders. It carries your shop's logo and colors and works on a phone." },
      { title: "Send a link", body: "Open the customer and use the Customer portal card.", steps: ["Email the link to the address on file, or create a link to copy and text yourself.", "Links expire after 30 days and only the latest few stay active.", "Revoke all links from the same card if a customer loses their phone or asks you to."] },
      { title: "Customers can ask for their own link", body: "Customers can request a fresh link on your shop's portal page; it is only ever emailed to the address you have on file, and the page never reveals whether an email is a customer." },
    ],
  },
  {
    slug: "import-your-data", title: "Import customers and vehicles", category: "Getting started",
    summary: "Bring your data over from CSV or Excel with a preview before anything is saved.",
    sections: [
      { title: "Prepare your file", body: "Export customers (and their vehicles) from your previous system as CSV or Excel. One row per vehicle works well: each row carries its owner's email, phone or name." },
      { title: "Import in four steps", body: "Open Import data.", steps: ["Upload the file — column names are matched automatically and you can adjust them.", "Review the validation: nothing is written yet, and every problem row is listed.", "Choose how to treat duplicates (skip, or update empty fields) and confirm.", "Download the rows with errors, fix them and import them again."] },
      { title: "Limits by plan", body: "Every plan can import customers and vehicles (up to 500 rows per file). Pro and Complete also import inventory and larger files (up to 10,000 rows)." },
    ],
  },
  {
    slug: "branded-communications", title: "Configure branded customer communications", category: "Communicate & retain",
    summary: "Set up mailboxes, a sending domain and routing so messages go out under your shop's identity.",
    sections: [
      { title: "Before you begin", body: "You need access to the communications settings, and administrator rights to change domain and routing configuration." },
      { title: "Set up delivery", body: "Open Notifications in settings.", steps: ["Review or add the mailboxes your shop sends from.", "Configure your sending domain if you want messages to come from your own address.", "Review communication routing so messages go to the right place."] },
      { title: "Confirm it's working", body: "Send a test message through a real workflow, such as an appointment confirmation or estimate, and check the delivery result before relying on it for customers." },
    ],
  },
];

export const BLOG_POSTS: ResourceArticle[] = [
  {
    slug: "a-clearer-start-to-the-shop-day", title: "A clearer start to the shop day", category: "Shop operations",
    summary: "A short morning review helps the front desk and workshop work from the same information.", relatedGuide: "configure-online-booking",
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
    sections: [
      { title: "One customer, the right vehicles", body: "Start by searching for an existing customer. Creating a new record for each visit splits useful history across several places. Confirm the identifying details of the vehicle instead of choosing by make alone, especially for households or businesses that bring in several similar vehicles." },
      { title: "Write for the next person", body: "A service description should make sense to someone who did not handle the appointment. Record the work clearly and keep relevant documents associated with the correct customer and vehicle. Avoid relying on private shorthand that only one mechanic understands." },
      { title: "Review history before the conversation", body: "When a customer returns, review their associated estimates and invoices before preparing a new document. This gives the conversation context and makes it easier to distinguish work previously proposed from work actually invoiced. Use the record as a starting point and confirm the current request with the customer." },
      { title: "Keep contact details current", body: "A complete history is less helpful if the next estimate goes to an old address. Confirm email, phone and communication preferences when they change. Treat record maintenance as part of the service handoff: the next appointment should begin with information the team can use." },
    ],
  },
];
