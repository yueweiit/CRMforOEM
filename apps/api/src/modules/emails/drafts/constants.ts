import type { EmailDraftPurpose } from "@oem-crm/shared";

export const EMAIL_PROMPT_BASE =
  "Write in English. Keep it specific, concise, non-spammy, and based only on the provided evidence.";

export const EMAIL_PROMPT_RECIPIENT_HINT =
  "Address the email to the intendedRecipient provided in the context.";

export const EMAIL_PROMPT_FOLLOW_UP_HINT =
  "Make the next step explicit enough for a salesperson to create or complete a follow-up task.";

export const EMAIL_PROMPT_FACT_SAFETY_HINT =
  "Do not invent prices, sample status, exhibition details, order history, shipment tracking, certifications, or previous cooperation unless they are provided in the context or user instructions.";

export const EMAIL_PROMPT_TEMPLATES: Record<EmailDraftPurpose | "DEFAULT", string[]> = {
  FIRST_OUTREACH: [
    "You are writing a first OEM/ODM outreach email to a target customer who has not interacted with us before.",
    "Use the customer's website analysis, product lines, brand positioning, and OEM fit score to explain why this outreach is relevant.",
    "Briefly introduce our OEM/ODM capabilities and recommend one clear cooperation angle.",
    "Keep the email warm, specific, concise, and non-spammy.",
    "End with a low-pressure question inviting a short reply or quick discussion."
  ],
  NO_REPLY_FOLLOW_UP: [
    "You are writing a polite follow-up email after the first outreach received no reply.",
    "Do not sound pushy, automated, or impatient.",
    "Briefly reference the previous email and add one new value point based on the customer's product line or missing category opportunity.",
    "Keep the email shorter than the first outreach.",
    "End with a simple yes/no or lightweight question to make replying easy."
  ],
  PRODUCT_RECOMMENDATION: [
    "You are writing a targeted product recommendation email.",
    "Use the customer's website product analysis, missing categories, OEM fit score, and our product database to recommend relevant products.",
    "Clearly explain why each recommended product matches the customer's current product line, brand positioning, or potential gap.",
    "Avoid listing too many products; focus on 1 to 3 strong recommendations.",
    "Invite the customer to request specifications, catalog, samples, or customization options."
  ],
  REQUIREMENT_CONFIRMATION: [
    "You are writing a requirement confirmation email after the customer has replied or shown interest.",
    "The goal is to clarify product requirements before quotation, sampling, or detailed proposal.",
    "Ask targeted questions about product specifications, quantity, target price, packaging, certification, customization, delivery time, and intended market when relevant.",
    "Do not recommend unrelated products unless the context clearly supports it.",
    "Keep the tone responsive, professional, and focused on moving the conversation toward a clear requirement brief."
  ],
  QUOTATION: [
    "You are writing a formal quotation email after the customer has shown interest.",
    "The tone should be professional, clear, and commercially precise.",
    "If quotation details are provided in userInstructions, use them exactly and do not invent prices, MOQ, lead time, payment terms, or shipping terms.",
    "If key quotation details are missing, clearly state what needs to be confirmed instead of fabricating information.",
    "Structure the email with a short opening, quotation summary, assumptions or notes, and next steps."
  ],
  SAMPLE_FOLLOW_UP: [
    "You are writing a sample progress or sample follow-up email.",
    "Focus on sample confirmation, sample making, shipping arrangement, testing feedback, or next-step adjustment.",
    "If sample details, tracking number, lead time, or testing status are provided in userInstructions, use them exactly.",
    "Do not invent sample shipment status, tracking numbers, test results, or delivery dates.",
    "Keep the tone collaborative, responsible, and supportive."
  ],
  TRADE_SHOW_INVITATION: [
    "You are writing a trade show invitation or trade show follow-up email.",
    "If the email is before the exhibition, invite the customer to visit our booth and briefly explain what relevant products or OEM capabilities they can see.",
    "If the email is after the exhibition, thank them for the meeting or contact and summarize the next step.",
    "Use exhibition name, booth number, date, city, or meeting notes from userInstructions if provided.",
    "Do not invent exhibition details, booth numbers, meeting records, or attendance."
  ],
  NEW_PRODUCT_LAUNCH: [
    "You are writing a new product launch recommendation email to a new or existing customer.",
    "Introduce the new product briefly and explain why it may fit the customer's market, product line, or brand positioning.",
    "Use our product database and userInstructions for product details; do not invent specifications, certifications, pricing, or launch claims.",
    "Keep the email commercially useful, not like a generic newsletter.",
    "Invite the customer to review catalog, samples, specifications, or discuss customization."
  ],
  REORDER_REACTIVATION: [
    "You are writing a reorder or reactivation email to an existing or previously contacted customer.",
    "Reference previous cooperation, purchased products, seasonal demand, replenishment timing, or product updates only if provided in context or userInstructions.",
    "The goal is to reopen a commercially relevant conversation, not to send a generic greeting.",
    "Suggest one practical next step such as confirming replenishment timing, new demand, updated catalog, or revised quotation.",
    "Keep the tone familiar, professional, and efficient."
  ],
  DEFAULT: [
    "Write a personalized English OEM/ODM outreach email."
  ]
};
